import type { F2IerQator } from '../../lib/f2-ierarxiya';
import type { Daraxt } from '../../umumiy/jadval-filtr/ustunFiltr';

/**
 * F2 hujjat jadvali uchun Excel uslubidagi filtr yordamchilari (egasi 2026-10-27).
 * Ierarxiya (bo'lim → ish → resurs) jadvaldagi kabi tekis qatorlarga yoyiladi: ota qatorlar (bo'lim/blok) va
 * barg — hujjat qatorlari. Filtr faqat barglarga qo'llanadi; mos barg ota-bobolari bilan ko'rinadi.
 */
export type HujjatQator<L> = {
  /** 'o<qator_id>' — ota qator, 'l<akt_qator_id>' — hujjat qatori. */
  id: string; ota: string | null;
  q: F2IerQator<L>;
  /** Hujjat qatori (barg); ota qatorda — null. */
  line: L | null;
  /** Bitta smeta qatoridagi hujjat qatorining tartibi (0 — birinchisi). */
  k: number;
};

/** Ota qatormi — jadval ham shu shart bilan ota qatorni chizadi. */
export const otaQatormi = <L>(q: F2IerQator<L>): boolean => q.bolaSoni > 0 || q.tur === 'rz';

/** Ierarxiyani jadval chizadigan tartibda tekis qatorlarga yoyadi (ota — eng yaqin oldingi kichik darajali ota qator). */
export function hujjatQatorlar<L extends { akt_qator_id: number }>(ier: readonly F2IerQator<L>[]): HujjatQator<L>[] {
  const out: HujjatQator<L>[] = [];
  const stek: { daraja: number; id: string }[] = [];
  for (const q of ier) {
    while (stek.length && stek[stek.length - 1].daraja >= q.daraja) stek.pop();
    const ota = stek.length ? stek[stek.length - 1].id : null;
    if (otaQatormi(q)) {
      const id = 'o' + q.qator_id;
      out.push({ id, ota, q, line: null, k: 0 });
      stek.push({ daraja: q.daraja, id });
      continue;
    }
    q.qatorlar.forEach((line, k) => out.push({ id: 'l' + line.akt_qator_id, ota, q, line, k }));
  }
  return out;
}

export function hujjatDaraxti<L>(): Daraxt<HujjatQator<L>> {
  return { id: (r) => r.id, ota: (r) => r.ota, barg: (r) => r.line != null };
}

/** Ko'rinadigan hujjat qatorlari summasi (NULL ≠ 0: hech biri ma'lum bo'lmasa — null). */
export function korinadiganJami<L>(rows: readonly HujjatQator<L>[], pul: (l: L) => number | null | undefined): { summa: number | null; soni: number } {
  let summa: number | null = null; let soni = 0;
  for (const r of rows) {
    if (!r.line) continue;
    soni++;
    const v = pul(r.line);
    if (v != null && Number.isFinite(Number(v))) summa = (summa ?? 0) + Number(v);
  }
  return { summa, soni };
}
