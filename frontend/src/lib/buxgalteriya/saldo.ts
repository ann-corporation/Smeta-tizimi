/**
 * Boshlang'ich qoldiq importi (1C «оборотно-сальдовая ведомость» uslubidagi eksport, Excel/CSV): ustunlarni TAXMIN qilish va MOSLASH.
 * Hech bir real fayl tuzilishi qattiq yozilmagan: ustun nomlari ro'yxati (SALDO_USTUN_KALITLARI) va foydalanuvchi tanlovi (map) bor.
 * Natija — RPC `t2_bux_saldo_import_v1` ga beriladigan qatorlar (hisob, dt, kt, analitika). Pul qiymatlari matn sifatida (server tekshiradi);
 * hisob-kitob (Dt = Kt tekshiruvi) serverda — bu yerda yangi pul arifmetikasi yo'q.
 */
import { sonOl, type Cell, type Grid } from '../qarzdorlik/parse';
import type { SaldoQator } from '../../api/t2-bux-hisob';

export type SaldoMaydon = 'hisob' | 'kontragent' | 'shartnoma' | 'dt' | 'kt' | 'saldo';
export const SALDO_MAYDONLAR: readonly SaldoMaydon[] = ['hisob', 'kontragent', 'shartnoma', 'dt', 'kt', 'saldo'];

/** Sarlavha kalit so'zlari (kichik harf, qisman moslik). Yangi eksport tuzilishi uchun shu ro'yxat kengaytiriladi. */
export const SALDO_USTUN_KALITLARI: Record<SaldoMaydon, readonly string[]> = {
  hisob: ['счет', 'счёт', 'hisob', 'schyot', 'account'],
  kontragent: ['контрагент', 'kontragent', 'наименование', 'counterparty'],
  shartnoma: ['договор', 'shartnoma', 'contract'],
  dt: ['дебет', 'debet', 'debit', 'dt'],
  kt: ['кредит', 'kredit', 'credit', 'kt'],
  saldo: ['сальдо', 'saldo', 'balance'],
};

export type SaldoMap = Record<SaldoMaydon, number | null>;
const bosh = (): SaldoMap => ({ hisob: null, kontragent: null, shartnoma: null, dt: null, kt: null, saldo: null });
const kichik = (c: Cell) => String(c ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Sarlavha qatori (birinchi 20 qator ichida ≥ 2 maydon topilgan) va ustunlar xaritasi. Dt/Kt ustunlari bir nechta bo'lsa — OXIRGISI emas, birinchisi («davr boshi» emas, aniq tanlov uchun map qo'lda o'zgartiriladi). */
export function saldoUstunTaxmin(grid: Grid): { boshQator: number; map: SaldoMap } {
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const map = bosh();
    (grid[r] ?? []).forEach((c, i) => {
      const s = kichik(c); if (!s) return;
      for (const f of SALDO_MAYDONLAR) if (map[f] == null && SALDO_USTUN_KALITLARI[f].some((k) => s.includes(k))) { map[f] = i; break; }
    });
    if (SALDO_MAYDONLAR.filter((f) => map[f] != null).length >= 2) return { boshQator: r + 1, map };
  }
  return { boshQator: 0, map: bosh() };
}

/** Hisob kodi: 4 raqam («6010», «60.10»); boshqa qator (jami, sarlavha) — null. */
export function hisobKodi(c: Cell): string | null {
  const s = String(c ?? '').trim();
  const m = /^(\d{4})$/.exec(s) ?? /^(\d{2})[.\-](\d{2})$/.exec(s);
  return m ? m.slice(1).join('') : null;
}

export type SaldoMoslik = { kontragentlar: ReadonlyArray<{ id: number; nom: string; inn: string | null }>; shartnomalar: ReadonlyArray<{ id: number; raqam: string; kontragent_id: number | null }> };

export type SaldoParse = { qatorlar: SaldoQator[]; otkazildi: number; moslanmadi: number };

/** Gridni RPC qatorlariga aylantiradi. Summa bo'sh/0 qatorlar server tomonidan o'tkaziladi; hisobsiz qatorlar (jami/sarlavha) bu yerda o'tkaziladi. */
export function saldoQatorlar(grid: Grid, map: SaldoMap, boshQator: number, moslik: SaldoMoslik): SaldoParse {
  const qatorlar: SaldoQator[] = []; let otkazildi = 0; let moslanmadi = 0;
  const shMap = new Map(moslik.shartnomalar.map((s) => [kichik(s.raqam), s]));
  const kMap = new Map<string, number>();
  for (const k of moslik.kontragentlar) { kMap.set(kichik(k.nom), k.id); if (k.inn) kMap.set(kichik(k.inn), k.id); }
  for (let r = boshQator; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const hisob = map.hisob == null ? null : hisobKodi(row[map.hisob]);
    if (!hisob) { otkazildi++; continue; }
    let dt = map.dt == null ? null : sonOl(row[map.dt]);
    let kt = map.kt == null ? null : sonOl(row[map.kt]);
    if (map.saldo != null && dt == null && kt == null) { const s = sonOl(row[map.saldo]); if (s != null) { if (s >= 0) dt = s; else kt = -s; } }
    const q: SaldoQator = { hisob, dt: dt == null ? null : String(dt), kt: kt == null ? null : String(kt) };
    const sh = map.shartnoma == null ? undefined : shMap.get(kichik(row[map.shartnoma]));
    if (sh) { q.shartnoma_id = sh.id; if (sh.kontragent_id != null) q.kontragent_id = sh.kontragent_id; }
    const kk = map.kontragent == null ? undefined : kMap.get(kichik(row[map.kontragent]));
    if (kk != null) q.kontragent_id = kk;
    else if (!sh && ((map.kontragent != null && kichik(row[map.kontragent]) !== '') || (map.shartnoma != null && kichik(row[map.shartnoma]) !== ''))) moslanmadi++;
    qatorlar.push(q);
  }
  return { qatorlar, otkazildi, moslanmadi };
}
