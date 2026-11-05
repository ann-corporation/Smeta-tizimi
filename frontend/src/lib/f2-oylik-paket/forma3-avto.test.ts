/** Oylik paketda avtomatik Forma-3 (egasi 2026-11-05). Barcha sonlar SINTETIK. */
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { ReestrAkt } from '../f2-reestr/reestr';
import type { SvodF3, SvodShartnoma } from '../nakopitelniy-svod';
import { oyJami, type AktMoliya, type PaketAkt } from './oylik';
import { avtoForma3, f3F2Farq, f3RekvizitKamchilik, minimalSvod, oyF3Holati } from './forma3-avto';
import { paketTarkibiMatni } from './eksport';

const mol = (jami: number | null): AktMoliya => ({ ustamasiz: 1000, ustamali: jami == null ? null : 1100, nds: jami == null ? null : jami - 1100, jami, taxminiy: false, narxsizQator: 0, qatorSoni: 1, sabab: null });
const akt = (id: number, oy: string): ReestrAkt => ({ id, obyekt_id: 1, oy, raqam: String(id), holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 1000, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' });
const row = (id: number, oy: string, jami: number | null, bosqich: PaketAkt['bosqich'] = 'tasdiqlangan'): PaketAkt =>
  ({ akt: akt(id, oy), obyektNom: 'Alfa', loyiha: null, bosqich, moliya: mol(jami), moliyaXato: false, uchastkalar: null });
const shR = { id: 26, raqam: '26', nom: '2-LOT (shartnoma tuzilmagan)', jami_nds_bilan: null, summa_bez_nds: null };
const sotuv = (id: number, sana: string, summa: number, holat: SvodF3['holat']): SvodF3 =>
  ({ id, manba: 'sotuv', raqam: String(id), sotuv_sana: sana, sotuv_summa: summa, nds_foiz: 12, davr_boshi: null, davr_oxiri: null, holat, bajarilgan_f2_summa: null, izoh: null, versiya: 1 });
const svod = (f3: SvodF3[]): SvodShartnoma => ({ ...minimalSvod(shR, [{ id: 1, nom: 'Alfa' }]), f3 });
const varaq = (b: Uint8Array) => strFromU8(unzipSync(b)['xl/worksheets/sheet1.xml']);

describe('avtomatik Forma-3', () => {
  const rows = [row(1, '2026-10-01', 1232), row(2, '2026-10-01', 616), row(3, '2026-10-01', 9999, 'jarayonda'), row(4, '2026-09-01', 50)];

  it('saqlangan F3 yo‘q — oyning TASDIQLANGAN F2 lari jamisidan (QQS bilan), belgisi bilan; summa F2 jamisiga teng', () => {
    const a = avtoForma3({ sh: svod([]), oy: '2026-10', rows, tanlov: 'toliq', tashkilot: 'Pudratchi', imzo: { zakazchik: 'Buyurtmachi' } })!;
    const f2 = oyJami(rows.filter((r) => r.bosqich === 'tasdiqlangan' && r.akt.oy.startsWith('2026-10'))).jami.malum;
    expect(a.summa).toBe(f2);
    expect(a.summa).toBe(1848);
    expect(a.fayllar).toHaveLength(1);
    expect(a.fayllar[0].faylNomi).toMatch(/Ф3_АВТО_ПО_Ф-2.*2026-10\.xlsx$/);
    const x = varaq(a.fayllar[0].bytes);
    expect(x.toUpperCase()).toContain('АВТОМАТИЧЕСКИ ПО Ф-2, НЕ СОХРАНЁН');
    expect(x).toContain('1848');
  });

  it('«ikkalasi» — to‘liq va bir qatorli, ikkalasida bir xil summa', () => {
    const a = avtoForma3({ sh: svod([]), oy: '2026-10', rows, tanlov: 'ikkalasi', tashkilot: 'P', imzo: { zakazchik: 'B' } })!;
    expect(a.fayllar.map((f) => f.shakl)).toEqual(['toliq', 'bir_qatorli']);
    for (const f of a.fayllar) expect(varaq(f.bytes)).toContain('1848');
  });

  it('tasdiqlangan F2 yo‘q yoki summa noma’lum — avto F3 yasalmaydi (0 bo‘lib emas)', () => {
    expect(avtoForma3({ sh: svod([]), oy: '2026-10', rows: [row(3, '2026-10-01', 10, 'jarayonda')], tanlov: 'toliq' })).toBeNull();
    expect(avtoForma3({ sh: svod([]), oy: '2026-10', rows: [row(1, '2026-10-01', null)], tanlov: 'toliq' })).toBeNull();
  });

  it('saqlangan (tayyor) F3 ustun: holat «saqlangan»; faqat qoralama — «qoralama»; hech narsa — «avto»', () => {
    expect(oyF3Holati([svod([sotuv(5, '2026-10-20', 1800, 'tayyor')])], 26, '2026-10')).toBe('saqlangan');
    expect(oyF3Holati([svod([sotuv(5, '2026-10-20', 1800, 'qoralama')])], 26, '2026-10')).toBe('qoralama');
    expect(oyF3Holati([svod([])], 26, '2026-10')).toBe('avto');
    expect(oyF3Holati(null, 26, '2026-10')).toBe('avto');
    expect(f3F2Farq(1800, rows, '2026-10')).toEqual({ f2: 1848, farq: -48 });
  });

  it('rekvizit yetishmasa ham F3 yasaladi; yetishmaganlar ro‘yxati hujjatda va ПАКЕТ_СОСТАВ da', () => {
    expect(f3RekvizitKamchilik(shR, { tashkilot: null, imzo: {} })).toEqual(['подрядчик (наименование)', 'заказчик (реквизиты)', 'номер и дата договора (договор не заключён)']);
    expect(f3RekvizitKamchilik({ raqam: '12', nom: null }, { tashkilot: 'P', imzo: { zakazchik: 'B' } })).toEqual([]);
    const a = avtoForma3({ sh: svod([]), oy: '2026-10', rows, tanlov: 'toliq' })!;
    expect(a.kamchilik).toHaveLength(3);
    expect(varaq(a.fayllar[0].bytes)).toContain('Не хватает реквизитов');
    const tarkib = paketTarkibiMatni({ oy: '2026-10', fayllar: [], tekshiruvlar: [], otkazilgan: [], ogohlantirish: ['Форма № 3 2026-10: не хватает — заказчик'] });
    expect(tarkib).toContain('Внимание');
    expect(tarkib).toContain('не хватает — заказчик');
  });
});
