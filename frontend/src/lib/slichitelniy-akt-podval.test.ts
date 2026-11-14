import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { NAKRUTKA_KOEF_KODLAR, type NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { slichitelniyHujjatXlsx, slichitelniyModeli } from './slichitelniy-vedomost';
import type { F3DavrAkt } from './forma3-export';

/**
 * Zanjir sinovi (F-2 aktlar → slichitelniy): «ranee predyavleno» к оплате qator hisobida OBYEKT podvali bilan, F-2 aktlari esa O'Z podvali bilan
 * imzolangan. Ikki son farq qilsa — hujjat jim qolmaydi (nakopitelniy «К ОПЛАТЕ ПО АКТАМ Ф-2» bilan bir xil qoida). Barcha sonlar SINTETIK.
 */
const q = (id: number, ota: number | null, tur: string, hajm: number | null, o: Partial<T2Qator> = {}): T2Qator => ({
  id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: ota, daraja: 0, tartib: id, tur, kod: null, nom: `Q${id}`, birlik: 'м3', hajm, narx: tur === 'bl' || tur === 'rz' ? null : 1000,
  summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: null, ...o,
} as unknown as T2Qator);
const h = (id: number, fakt: number | null, f2 = 0): T2QatorHolat => ({ qator_id: id, fakt_hajm: fakt, f2_hajm: f2, f2_summa: f2 * 1000 } as unknown as T2QatorHolat);

const NK = Object.fromEntries(NAKRUTKA_KOEF_KODLAR.map((k) => [k, 0])) as NakrutkaKoeffitsientlar;
const nk: NakrutkaKoeffitsientlar = { ...NK, ['ПРОЧИЕ_ПОДРЯДЧИК']: 18, ['НДС']: 12 } as NakrutkaKoeffitsientlar;
const akt = (id: number, qqsBilan: number | null): F3DavrAkt => ({ aktId: id, raqam: String(id), hujjatPodvali: true, ustamasiz: 1, ustamali: 1, qqs: 1, qqsBilan, oy: '2026-03' });

const rows = [q(1, null, 'rz', null), q(2, 1, 'bl', 1), q(3, 2, 'rs', 10, { kat: 'ЧЕЛ' })];
const holat = [h(2, 10, 6), h(3, 10, 6)];

async function matnlar(bytes: Uint8Array): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => { if (typeof c.value === 'string') out.push(c.value); })));
  return out.join('\n').replace(/[\s  ]+/g, ' ');
}

describe('Slichitelniy ← F-2 aktlari: к оплате aktlar podvali bilan solishtiriladi', () => {
  const model = slichitelniyModeli(rows as T2Qator[], holat);
  // ilgari F-2 к оплате (obyekt podvali): 6000 × 1,18 × 1,12 = 7929,60
  const baza = { obyektNomi: 'О', sana: '2026-11-14', nakrutka: nk, faqatFarq: false };

  it('aktlar yig\'indisi qator hisobidan farq qilsa — izohda ikkala son va farq', async () => {
    const r = slichitelniyHujjatXlsx(model, { ...baza, aktlarKOplate: [akt(1, 5000), akt(2, 2000)] });
    const m = await matnlar(r.bytes);
    expect(m).toContain('К ОПЛАТЕ ПО АКТАМ Ф-2');
    expect(m).toContain('7 929,60');
    expect(m).toContain('7 000,00');
  });

  it('aktlar yig\'indisi qator hisobiga teng — ogohlantirish yo\'q', async () => {
    const r = slichitelniyHujjatXlsx(model, { ...baza, aktlarKOplate: [akt(1, 7000), akt(2, 929.6)] });
    expect(await matnlar(r.bytes)).not.toContain('К ОПЛАТЕ ПО АКТАМ Ф-2');
  });

  it('aktlar o\'qilmadi (null) — jim emas: ogohlantirish', async () => {
    const r = slichitelniyHujjatXlsx(model, { ...baza, aktlarKOplate: null });
    expect(await matnlar(r.bytes)).toContain('К ОПЛАТЕ ПО АКТАМ Ф-2');
  });

  it('opsiya berilmagan (eski chaqiruv) — hujjat o\'zgarmaydi', async () => {
    const r = slichitelniyHujjatXlsx(model, baza);
    expect(await matnlar(r.bytes)).not.toContain('К ОПЛАТЕ ПО АКТАМ Ф-2');
  });

  it('«faqat farq» ko\'rinishida (qism pozitsiyalar) — solishtirish qilinmaydi', async () => {
    const r = slichitelniyHujjatXlsx(model, { ...baza, faqatFarq: true, aktlarKOplate: [akt(1, 1)] });
    expect(await matnlar(r.bytes)).not.toContain('К ОПЛАТЕ ПО АКТАМ Ф-2');
  });
});
