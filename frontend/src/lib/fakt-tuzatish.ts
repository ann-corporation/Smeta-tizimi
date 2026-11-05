/**
 * Fakt qatlami — tuzatish qatorlari asosiy ishga ergashadi (egasi 2026-11-05, Sun'iy ko'l: qalinlik tuzatishlari
 * fakti 0 qolib, beton fakti oshib ketgan edi).
 *
 * Tushunish (qaysi qator tuzatish, asosi qaysi) — FAQAT smeta yadrosida (`smeta-anatomiya/tuzatish`). Bu modul faqat
 * fakt yozuvi paytida: asosiy ish fakti o'zgarsa, unga bog'langan tuzatishlarga fakt = tuzatish.hajm × (asos.fakt / asos.hajm)
 * delta sifatida xuddi shu `fakt_yoz_v2` paketiga qo'shiladi (bitta tranzaksiya, bitta operation_id). Asl smeta o'zgarmaydi.
 * Tuzatish qatoriga qo'lda kiritma qabul qilinmaydi (hosila). NULL ≠ 0: asos fakti noma'lum bo'lsa tuzatish yozilmaydi.
 */
import { tuzatishFakti, type TuzatishXarita } from './smeta-anatomiya/tuzatish';

export type PaketQator = { qator_id: number; hajm: number };

const yaxlit6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Paketga tuzatish deltalarini qo'shadi. `faktlar` — joriy server fakti (qator → hajm; yo'q = noma'lum),
 * `smetalar` — smeta hajmi. Bog'langan tuzatishlarning qo'lda kiritmasi paketdan olib tashlanadi.
 * Qaytaradi: yangi paket va qo'shilgan tuzatish id'lari (CAS tekshiruvi uchun).
 */
export function tuzatishPaketi(
  paket: readonly PaketQator[], xarita: Pick<TuzatishXarita, 'asos' | 'ergashuvchi'>,
  faktlar: ReadonlyMap<number, number | null>, smetalar: ReadonlyMap<number, number | null>,
): { qatorlar: PaketQator[]; tuzatishlar: number[] } {
  const qatorlar = paket.filter((x) => !xarita.asos.has(x.qator_id));
  const tuzatishlar: number[] = [];
  for (const x of [...qatorlar]) {
    const ergash = xarita.ergashuvchi.get(x.qator_id);
    if (!ergash?.length) continue;
    const joriy = faktlar.get(x.qator_id);
    const asosFakt = joriy == null ? null : yaxlit6(joriy + x.hajm);
    for (const tid of ergash) {
      const maqsad = tuzatishFakti(smetalar.get(tid), asosFakt, smetalar.get(x.qator_id));
      if (maqsad == null) continue;
      const delta = yaxlit6(maqsad - (faktlar.get(tid) ?? 0));
      if (delta === 0) continue;
      qatorlar.push({ qator_id: tid, hajm: delta });
      tuzatishlar.push(tid);
    }
  }
  return { qatorlar, tuzatishlar };
}
