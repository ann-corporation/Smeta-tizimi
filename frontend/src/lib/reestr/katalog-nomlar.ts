/**
 * Mobil katalog tarjimasi uchun kerakli o'zbekcha nomlar to'plami (sahifa, band, guruh) — yagona reestrdan (sahifa.ts).
 * Sof ma'lumot; generator (scripts/generate-katalog-nom.ts) va test shundan o'qiydi.
 */
import { NAV_GURUH_META, SAHIFALAR } from './sahifa';

export function katalogNomlari(): Set<string> {
  const s = new Set<string>();
  for (const g of NAV_GURUH_META) { s.add(g.nom); for (const b of g.bandlar) s.add(b.nom); }
  for (const p of SAHIFALAR) s.add(p.nom);
  return s;
}
