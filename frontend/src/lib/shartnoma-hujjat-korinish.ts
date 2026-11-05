/** Shartnoma asl hujjatlari bo'limi uchun sof ko'rinish yordamchilari (components/shartnoma-liniya/ShartnomaHujjatlar.tsx). */
import type { ShartnomaHujjatlar } from '../api/t2-shartnoma-hujjat';

export function sanaKorinish(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—';
}

export function hajmKorinish(b: number | null | undefined): string {
  if (b == null || !Number.isFinite(b) || b <= 0) return '—';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/** Joriy shartnoma summasi: eng so'nggi faol DS (sana, keyin id bo'yicha), bo'lmasa shartnomaning o'zi. */
export function joriySumma(m: Pick<ShartnomaHujjatlar, 'shartnoma' | 'ds'>): number | null {
  if (m.ds.length === 0) return m.shartnoma.jami_nds_bilan;
  const s = [...m.ds].sort((a, b) => (a.sana === b.sana ? a.id - b.id : a.sana < b.sana ? -1 : 1));
  return s[s.length - 1].jami_nds_bilan;
}
