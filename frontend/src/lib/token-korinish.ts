/**
 * Tokenlar sahifasi ko'rinishi (egasi 2026-10-25: balans — o'lchagich, sarf — grafik).
 * Faqat serverdan kelgan harakatlar daftaridan (TokenHarakat) — yangi hisob qoidasi YO'Q.
 * NULL ≠ 0: sarf bo'lmasa «necha kunga yetadi» noma'lum (null).
 */
export type HarakatQisqa = { miqdor: number; tur: string; yaratildi: string };
export type KunSarf = { sana: string; sarf: number; kirim: number };

const kunKaliti = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Oxirgi `kun` kun (bugun ham) bo'yicha kunlik sarf va kirim (token). Bo'sh kunlar 0 bilan — chiziq uzilmasin. */
export function kunlikSarf(harakatlar: readonly HarakatQisqa[], bugun: Date, kun = 30): KunSarf[] {
  const out: KunSarf[] = [];
  const idx = new Map<string, KunSarf>();
  for (let i = kun - 1; i >= 0; i--) {
    const d = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - i);
    const k: KunSarf = { sana: kunKaliti(d), sarf: 0, kirim: 0 };
    out.push(k); idx.set(k.sana, k);
  }
  for (const h of harakatlar) {
    const d = new Date(h.yaratildi);
    if (Number.isNaN(d.getTime())) continue;
    const k = idx.get(kunKaliti(d));
    if (!k) continue;
    if (h.miqdor < 0) k.sarf += -h.miqdor; else k.kirim += h.miqdor;
  }
  return out;
}

export type BalansOlchov = {
  /** Oxirgi 30 kun sarfi (token). */
  sarf30: number;
  /** O'rtacha kunlik sarf; sarf yo'q — null. */
  kunlik: number | null;
  /** Balans necha kunga yetadi (butun); sarf yo'q — null. */
  kunlarga: number | null;
  /** Chizish: balans / 30 kunlik sarf, 0..1 (sarf yo'q va balans bor — 1). */
  ulush: number;
  holat: 'yetarli' | 'kam' | 'tugagan' | 'nomalum';
};

export function balansOlchov(balans: number, kunlar: readonly KunSarf[]): BalansOlchov {
  const sarf30 = kunlar.reduce((s, k) => s + k.sarf, 0);
  const kunlik = sarf30 > 0 ? sarf30 / Math.max(1, kunlar.length) : null;
  const kunlarga = kunlik ? Math.floor(Math.max(0, balans) / kunlik) : null;
  const ulush = balans <= 0 ? 0 : sarf30 > 0 ? Math.min(1, balans / sarf30) : 1;
  const holat = balans <= 0 ? 'tugagan' : kunlarga == null ? 'nomalum' : kunlarga < 7 ? 'kam' : 'yetarli';
  return { sarf30, kunlik, kunlarga, ulush, holat };
}
