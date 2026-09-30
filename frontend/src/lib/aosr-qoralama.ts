/**
 * aosr-qoralama.ts — belgilangan bajarilgan ishlardan АОСР qoralamasi.
 * Ishlar (bl) → 1-bo'lim bandlari, materiallar/uskunalar (mat/ob) → 3-bo'lim.
 * Hajm faktdan; yo'q bo'lsa yozilmaydi (o'ylab topilmaydi).
 */
import type { AosrCoverage } from '../api/t2-aosr';
import type { AosrMalumot } from '../api/t2-ijro';

/** Belgilangan bajarilgan ishlardan akt qoralamasi: ishlar → 1-bo'lim, materiallar → 3-bo'lim. */
export function qoralamaTanlangandan(qatorlar: readonly AosrCoverage[]): Pick<AosrMalumot, 'ish_nomi' | 'ish_tavsifi' | 'materiallar'> {
  const hajm = (c: AosrCoverage) => (c.fakt_hajm != null ? ` — ${Number(c.fakt_hajm).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${c.birlik ?? ''}`.trimEnd() : '');
  const ishlar = qatorlar.filter((c) => c.kat !== 'mat' && c.kat !== 'ob');
  const mat = qatorlar.filter((c) => c.kat === 'mat' || c.kat === 'ob');
  return {
    ish_nomi: ishlar[0]?.nom ?? mat[0]?.nom ?? '',
    ish_tavsifi: ishlar.map((c) => `${c.nom ?? ''}${hajm(c)}`).join('\n'),
    materiallar: mat.map((c) => `${c.nom ?? ''}${hajm(c)}`).join('; '),
  };
}

