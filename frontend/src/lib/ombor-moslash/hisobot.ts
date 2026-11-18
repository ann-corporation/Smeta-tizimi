/**
 * Ombor kirim-chiqim hisoboti va istalgan sanadagi ostatka. Sof funksiyalar (DB/tarmoq yo'q) — server, Android va Telegram bir xil hisob-kitobdan foydalanadi.
 *
 * Qoidalar:
 *  - Hisobotga FAQAT haqiqiy kirim/chiqim kiradi: storno / tuzatish-storno / qaytarish yozuvlari va ularning tomonidan to'liq bekor qilingan asl yozuvlar CHIQARILADI
 *    (tuzatilgan yozuv bo'yicha faqat yangi qiymat qoladi). Chetlatilgan yozuvlar soni alohida qaytariladi.
 *  - Ostatka esa hamma yozuvlar bo'yicha (kirim +, chiqim -) — storno va qaytarish ostatkani to'g'rilaydi (SQL t2_ombor_qoldiq_v2 bilan bir xil ishora).
 *  - Narx doim QQS siz. Summa = hajm x narx faqat narxi BOR qatorlar bo'yicha; narxsiz qator 0 emas — «noma'lum» (soni alohida). QQS bilan = QQS siz + QQS (yagona nds.ts).
 *  - Variant guruhi bosqichi yo'q (egasi qarori): guruh kaliti = lotin/kirill farqsiz nom + birlik.
 */
import { NDS_SUKUT_FOIZ, qqsBilan } from '../hisob-yadro/nds';
import { yaxlit2 } from '../hisob-yadro/yaxlit';
import { birlikKaliti, nomKaliti, nomTokenlari, nomTokenlariXom } from './moslash';
import { mosmi } from './eslatma';

export type HarakatQator = {
  id: number; sana: string; operatsiya: string; nomi: string | null; birligi: string | null; obyomi: number | string | null;
  postavshik?: string | null; qabul_qiluvchi?: string | null; narx?: number | string | null; manba?: string | null;
  c11_hedef_obyekt_id?: number | null; c11_storno_of_id?: number | null; c11_juft_id?: number | null; izoh?: string | null;
};

/** Storno/qaytarish yozuvlari (hisobotga kirmaydi). */
export const STORNO_MANBALAR: readonly string[] = ['c11_warehouse_storno_v1', 'ombor_tuzat_storno_v1', 'ombor_chiqim_qaytarish_v1'];
/** Asl yozuvni TO'LIQ bekor qiladigan manbalar (asl yozuv ham hisobotdan chiqadi). Qaytarish qisman bo'lishi mumkin — asl yozuv qoladi. */
const TOLIQ_BEKOR: readonly string[] = ['c11_warehouse_storno_v1', 'ombor_tuzat_storno_v1'];
/** Ostatkaga ta'sir qiladigan manbalar (t2_ombor_qoldiq_v2 bilan bir xil). */
export const OSTATKA_MANBALARI: readonly string[] = ['c11_warehouse_receipt_v1', 'c11_warehouse_storno_v1', 'c11_warehouse_berdim_v1',
  'ombor_prixod_v1', 'ombor_prixod_sinxron_v1', 'ombor_chiqim_v1', 'ombor_chiqim_qaytarish_v1', 'ombor_tuzat_storno_v1'];

const son = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const toza = (v: unknown): string | null => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s || null; };
const yaxlit = (n: number, k = 4) => Math.round(n * 10 ** k) / 10 ** k;
const pul = yaxlit2;

/** Erkin matn filtri (material, yetkazuvchi): so'rovdagi har bir so'z nom so'zlaridan birining BOSHIGA mos (lotin/kirill farqsiz). */
export function matnMosmi(sorov: string | null | undefined, matn: string | null | undefined): boolean {
  const q = toza(sorov); if (!q) return true;
  const m = toza(matn); if (!m) return false;
  const tok = new Set([...nomTokenlari(m), ...nomTokenlariXom(m)]);
  const qs = nomTokenlari(q), qx = nomTokenlariXom(q);
  if (!qs.length && !qx.length) return m.toLowerCase().includes(q.toLowerCase());
  return mosmi(qs, tok) || mosmi(qx, tok);
}

/** Haqiqiy kirim/chiqimlar: storno/qaytarish va to'liq bekor qilingan asllarsiz. */
export function haqiqiyHarakatlar(qatorlar: readonly HarakatQator[]): { haqiqiy: HarakatQator[]; chetlatilgan: number } {
  const bekor = new Set<number>();
  for (const q of qatorlar) {
    if (q.manba && TOLIQ_BEKOR.includes(q.manba)) { const a = son(q.c11_storno_of_id) ?? son(q.c11_juft_id); if (a != null) bekor.add(a); }
  }
  const korilgan = new Set<number>(); const haqiqiy: HarakatQator[] = []; let chetlatilgan = 0;
  for (const q of qatorlar) {
    if (korilgan.has(q.id)) continue; korilgan.add(q.id);
    if ((q.manba && STORNO_MANBALAR.includes(q.manba)) || bekor.has(q.id)) { chetlatilgan += 1; continue; }
    if (q.operatsiya !== 'prixod' && q.operatsiya !== 'rasxod') continue;
    haqiqiy.push(q);
  }
  return { haqiqiy, chetlatilgan };
}

export type HisobotFiltr = {
  dan?: string | null; gacha?: string | null; qidir?: string | null; yetkazuvchi?: string | null; qabul?: string | null;
  /** yetkazuvchi yoki qabul qiluvchi (yo'nalish noma'lum bo'lganda: «Alfa-snabdan nima olganmiz») */
  kontragent?: string | null; obyekt_idlar?: readonly number[] | null; operatsiya?: 'prixod' | 'rasxod' | null;
};
export type HisobotQator = {
  id: number; sana: string; operatsiya: 'prixod' | 'rasxod'; nomi: string; birligi: string; obyomi: number; kontragent: string | null;
  obyekt_id: number | null; narx: number | null; summa: number | null; summa_qqs: number | null; izoh: string | null;
};
export type BirlikJami = { birligi: string; kirim: number; chiqim: number };
export type HisobotJami = {
  kirim_soni: number; chiqim_soni: number; birliklar: BirlikJami[];
  kirim_summa: number; kirim_summa_qqs: number;
  /** Chiqimda narx saqlanmaydi: narxli chiqim yo'q bo'lsa null (0 emas — noma'lum). */
  chiqim_summa: number | null; chiqim_summa_qqs: number | null;
  /** Narxi yozilmagan KIRIM qatorlari soni (jami summaga kirmaydi). */
  narxsiz_soni: number; qqs_foiz: number;
};
export type Hisobot = { qatorlar: HisobotQator[]; jami: HisobotJami; chetlatilgan: number };

export function hisobotYigish(qatorlar: readonly HarakatQator[], f: HisobotFiltr = {}, qqsFoiz: number = NDS_SUKUT_FOIZ): Hisobot {
  const { haqiqiy, chetlatilgan } = haqiqiyHarakatlar(qatorlar);
  const obyektlar = f.obyekt_idlar && f.obyekt_idlar.length ? new Set(f.obyekt_idlar) : null;
  const chiqish: HisobotQator[] = [];
  for (const q of haqiqiy) {
    const sana = toza(q.sana) ?? ''; const nomi = toza(q.nomi), birligi = toza(q.birligi), h = son(q.obyomi);
    if (!sana || !nomi || !birligi || h == null || h <= 0) continue;
    if (f.dan && sana < f.dan) continue; if (f.gacha && sana > f.gacha) continue;
    if (f.operatsiya && q.operatsiya !== f.operatsiya) continue;
    if (f.qidir && !matnMosmi(f.qidir, nomi)) continue;
    if (f.yetkazuvchi && !(q.operatsiya === 'prixod' && matnMosmi(f.yetkazuvchi, q.postavshik))) continue;
    if (f.qabul && !(q.operatsiya === 'rasxod' && matnMosmi(f.qabul, q.qabul_qiluvchi))) continue;
    if (f.kontragent && !(matnMosmi(f.kontragent, q.postavshik) || matnMosmi(f.kontragent, q.qabul_qiluvchi))) continue;
    if (obyektlar && !(q.c11_hedef_obyekt_id != null && obyektlar.has(Number(q.c11_hedef_obyekt_id)))) continue;
    const narxRaw = son(q.narx); const narx = narxRaw != null && narxRaw > 0 ? narxRaw : null;
    const summa = narx == null ? null : pul(narx * h);
    chiqish.push({
      id: q.id, sana, operatsiya: q.operatsiya as 'prixod' | 'rasxod', nomi, birligi, obyomi: yaxlit(h), kontragent: toza(q.operatsiya === 'prixod' ? q.postavshik : q.qabul_qiluvchi),
      obyekt_id: q.c11_hedef_obyekt_id ?? null, narx, summa, summa_qqs: summa == null ? null : qqsBilan(summa, qqsFoiz), izoh: toza(q.izoh),
    });
  }
  chiqish.sort((a, b) => (a.sana < b.sana ? 1 : a.sana > b.sana ? -1 : b.id - a.id));
  const birl = new Map<string, BirlikJami>(); let kS = 0, cS = 0, cNarxli = 0, narxsiz = 0, kN = 0, cN = 0;
  for (const r of chiqish) {
    const k = birlikKaliti(r.birligi); let b = birl.get(k);
    if (!b) { b = { birligi: r.birligi, kirim: 0, chiqim: 0 }; birl.set(k, b); }
    if (r.operatsiya === 'prixod') { b.kirim += r.obyomi; kN += 1; if (r.summa != null) kS += r.summa; } else { b.chiqim += r.obyomi; cN += 1; if (r.summa != null) { cS += r.summa; cNarxli += 1; } }
    if (r.summa == null && r.operatsiya === 'prixod') narxsiz += 1;
  }
  const birliklar = [...birl.values()].map((b) => ({ ...b, kirim: yaxlit(b.kirim), chiqim: yaxlit(b.chiqim) })).sort((a, b) => (b.kirim + b.chiqim) - (a.kirim + a.chiqim));
  return {
    qatorlar: chiqish, chetlatilgan,
    jami: { kirim_soni: kN, chiqim_soni: cN, birliklar, kirim_summa: pul(kS), kirim_summa_qqs: qqsBilan(pul(kS), qqsFoiz) ?? 0, chiqim_summa: cNarxli ? pul(cS) : null, chiqim_summa_qqs: cNarxli ? qqsBilan(pul(cS), qqsFoiz) : null, narxsiz_soni: narxsiz, qqs_foiz: qqsFoiz },
  };
}

export type QoldiqQator = { kalit: string; nomi: string; birligi: string; kirim: number; chiqim: number; qoldiq: number; oxirgi_sana: string | null; harakatlar: number };

/** Berilgan sana (shu kun oxirigacha) ostatkasi: barcha yozuvlar (storno/qaytarish ham) ishorasi bilan. */
export function qoldiqSanada(qatorlar: readonly HarakatQator[], sana: string | null, opts: { qidir?: string | null; faqatMusbat?: boolean } = {}): QoldiqQator[] {
  const g = new Map<string, QoldiqQator & { sanaKalit: string }>(); const korilgan = new Set<number>();
  for (const q of qatorlar) {
    if (korilgan.has(q.id)) continue; korilgan.add(q.id);
    if (q.manba && !OSTATKA_MANBALARI.includes(q.manba)) continue;
    const s = toza(q.sana); const nomi = toza(q.nomi), birligi = toza(q.birligi), h = son(q.obyomi);
    if (!s || !nomi || !birligi || h == null || (q.operatsiya !== 'prixod' && q.operatsiya !== 'rasxod')) continue;
    if (sana && s > sana) continue;
    const kalit = nomKaliti(nomi) + '|' + birlikKaliti(birligi);
    let x = g.get(kalit);
    if (!x) { x = { kalit, nomi, birligi, kirim: 0, chiqim: 0, qoldiq: 0, oxirgi_sana: null, harakatlar: 0, sanaKalit: '' }; g.set(kalit, x); }
    if (q.operatsiya === 'prixod') x.kirim += h; else x.chiqim += h;
    x.harakatlar += 1;
    if (s > x.sanaKalit) { x.sanaKalit = s; x.oxirgi_sana = s; x.nomi = nomi; x.birligi = birligi; }
  }
  const nat = [...g.values()].map(({ sanaKalit: _s, ...x }) => ({ ...x, kirim: yaxlit(x.kirim), chiqim: yaxlit(x.chiqim), qoldiq: yaxlit(x.kirim - x.chiqim) }))
    .filter((x) => (!opts.qidir || matnMosmi(opts.qidir, x.nomi)) && (!opts.faqatMusbat || x.qoldiq > 0));
  return nat.sort((a, b) => a.nomi.localeCompare(b.nomi));
}
