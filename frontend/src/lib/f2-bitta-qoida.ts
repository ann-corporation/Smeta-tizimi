/**
 * «Obyekt x oy = BITTA F-2» qoidasi (egasi 2026-11-19). Toza funksiyalar; server tomoni: migratsiya 20270116000001
 * (`_t2_f2_oy_takror_v1`, `t2_forma3_yarat_v1` langari, qoralama saqlash kesishuvi). Bu yerda — UI va oylik paket rad etishi.
 * Brauzerda korrektirovka/storno aktlari ajratilmaydi: ikki TASDIQLANGAN F-2 bu yerda xato emas (alohida ogohlantirish bor);
 * takror — kamida bittasi qoralama (tasdiqlanmagan) yoki «taxminiy / prorab tasdig'i» belgili bo'lganda.
 */
import { bosqich, type ReestrAkt } from './f2-reestr/reestr';

export type BittaF2Akt = Pick<ReestrAkt, 'id' | 'obyekt_id' | 'oy' | 'raqam' | 'holat' | 'lifecycle_status'>;
export type OyTakror = { obyektId: number; oy: string; aktlar: Array<{ id: number; raqam: string | null }>; taxminiyIds: number[] };

/** Raqamda «taxminiy» yoki «prorab» bo'lsa — prorab tasdig'ini kutayotgan taxminiy qoralama. */
export const taxminiyMi = (a: Pick<ReestrAkt, 'raqam'>): boolean => /taxminiy|prorab/i.test(a.raqam ?? '');

const oyKalit = (oy: string) => oy.slice(0, 7);

/** Bir obyektda bir oy uchun bekor qilinmagan >1 F-2 (kamida bittasi tasdiqlanmagan yoki taxminiy). */
export function oyTakrorlari(aktlar: readonly BittaF2Akt[]): OyTakror[] {
  const guruh = new Map<string, BittaF2Akt[]>();
  for (const a of aktlar) {
    if (bosqich(a) === 'bekor') continue;
    const k = `${a.obyekt_id}|${oyKalit(a.oy)}`;
    const l = guruh.get(k);
    if (l) l.push(a); else guruh.set(k, [a]);
  }
  const out: OyTakror[] = [];
  for (const l of guruh.values()) {
    if (l.length < 2) continue;
    if (!l.some((a) => bosqich(a) !== 'tasdiqlangan' || taxminiyMi(a))) continue;
    out.push({ obyektId: l[0].obyekt_id, oy: oyKalit(l[0].oy),
      aktlar: l.map((a) => ({ id: a.id, raqam: a.raqam })).sort((x, y) => x.id - y.id), taxminiyIds: l.filter(taxminiyMi).map((a) => a.id) });
  }
  return out.sort((x, y) => x.obyektId - y.obyektId || x.oy.localeCompare(y.oy));
}

export type PaketRad = { takrorlar: OyTakror[]; taxminiyIds: number[] };

/** Tanlangan aktlar tashqariga ketadigan paketga kirishi mumkinmi: takror (tanlanganlar ichida) yoki taxminiy bo'lsa — yo'q. */
export function paketRadEtish(aktlar: readonly BittaF2Akt[], tanlov: ReadonlySet<number>): PaketRad {
  const takrorlar = oyTakrorlari(aktlar).filter((t) => t.aktlar.filter((a) => tanlov.has(a.id)).length > 1
    || (t.aktlar.some((a) => tanlov.has(a.id)) && t.taxminiyIds.length > 0));
  const taxminiyIds = aktlar.filter((a) => tanlov.has(a.id) && taxminiyMi(a)).map((a) => a.id);
  return { takrorlar, taxminiyIds };
}

/** Rad etish xabari (o'zbekcha, akt idlari bilan); rad etilmasa null. */
export function paketRadXabari(r: PaketRad): string | null {
  if (!r.takrorlar.length && !r.taxminiyIds.length) return null;
  const qismlar: string[] = [];
  if (r.takrorlar.length) qismlar.push(`Bir obyektda bir oyga bir nechta F-2 bor (obyekt x oy = bitta F-2): ${r.takrorlar.map((t) => `obyekt ${t.obyektId}, ${t.oy}: akt ${t.aktlar.map((a) => a.id).join(', ')}`).join('; ')}.`);
  if (r.taxminiyIds.length) qismlar.push(`Taxminiy qoralama (prorab tasdig'i kutilmoqda) tashqi paketga kirmaydi: akt ${r.taxminiyIds.join(', ')}.`);
  return `${qismlar.join(' ')} Ortiqcha F-2 ni bekor qiling yoki paketdan olib tashlang.`;
}
