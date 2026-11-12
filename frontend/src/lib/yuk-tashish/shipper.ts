/** Yuk egasi formasi yordamchilari: mashina sinflari (ma'lumotnoma) va narx bahosining bir qatorli tarkibi. Sof funksiyalar. */
import type { NarxNatija } from '../yuk-birjasi/narx';

/** Mashina sinflari (kod = serverdagi t2_yb_yuk.mashina_sinf CHECK qiymatlari). */
export const MASHINA_SINF: ReadonlyArray<{ kod: string; nom: string }> = [
  { kod: 'yengil', nom: 'Yengil (≈1 t gacha)' }, { kod: 'kichik', nom: 'Kichik yuk mashinasi (≈3 t)' }, { kod: 'orta', nom: 'O‘rta (≈10 t)' },
  { kod: 'katta', nom: 'Katta (≈20 t)' }, { kod: 'samosval', nom: 'Samosval' }, { kod: 'tent', nom: 'Tentli' }, { kod: 'ref', nom: 'Refrijerator' },
];

/** Bir qatorli tarkib: «420 km · 20 t · stavka × koeffitsiyent». Yetishmasa nima yetishmayotgani aytiladi; narx noma'lum — «—» (0 emas). */
export function narxQator(b: NarxNatija): { matn: string; tayyor: boolean } {
  if (b.qqsSiz == null) {
    const nima = b.yetishmaydi.map((x) => (x === 'masofa' ? 'masofa' : x === 'tonna' ? 'tonna' : 'narx stavkasi')).join(', ');
    return { matn: `Taxminiy narx: — (yetishmaydi: ${nima || 'ma’lumot'})`, tayyor: false };
  }
  const koef = Number(b.tarkib.koeffitsiyent.toFixed(2));
  return { matn: `${b.tarkib.tonnaKm != null ? Math.round(b.tarkib.tonnaKm) : '—'} t·km × stavka × k ${koef}${b.minQollandi ? ' (minimal tarif)' : ''} = ${Math.round(b.qqsSiz)} UZS (QQS siz)`, tayyor: true };
}
