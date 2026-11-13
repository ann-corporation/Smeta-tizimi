import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { armaturaBelgilari, betonBelgilari, hajmFormulasi, hajmQatorlari, labIlovaQur } from './aosr-ilova';
import { aosrKitobExcel, aosrExcel, materiallarSertifikatBilan, sanasizQil, type AosrKirish } from './aosr-export';

async function yukla(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}
const matnlar = (ws: ExcelJS.Worksheet) => { const m: string[] = []; ws.eachRow((r) => r.eachCell((c) => { if (typeof c.value === 'string' && c.value) m.push(c.value); })); return m.join('\n'); };

describe('belgilar', () => {
  it('beton: sinf, marka, W, F', () => {
    expect(betonBelgilari('Бетон тяжёлый В25 W6 F150')).toEqual({ sinf: 'B25', marka: null, suv: 'W6', sovuq: 'F150' });
    expect(betonBelgilari('бетон класса B22,5 М300').sinf).toBe('B22,5');
    expect(betonBelgilari('Блок В100').sinf).toBeNull(); // B100 — sinf emas
    expect(betonBelgilari('бетон М350').marka).toBe('М350');
  });
  it('armatura: Ø va klass', () => {
    expect(armaturaBelgilari('Арматура Ø12 А500С, ф16 А-III')).toEqual({ diametrlar: [12, 16], klasslar: ['А500С', 'АIII'] });
    expect(armaturaBelgilari('Кирпич М100')).toEqual({ diametrlar: [], klasslar: [] });
  });
  it('hajm formulasi birlikdan', () => {
    expect(hajmFormulasi('м3')).toBe('V = L × B × H');
    expect(hajmFormulasi('м2')).toBe('S = L × B');
    expect(hajmFormulasi('т')).toContain('M =');
    expect(hajmFormulasi('komp')).toBe('');
  });
});

describe('ilova qurish', () => {
  const ishlar = [{ nom: 'Бетонирование плиты', birlik: 'м3', fakt_hajm: 45.5, kat: 'bl' }, { nom: 'Бетон В25', birlik: 'м3', fakt_hajm: 46, kat: 'mat' }];
  it('hajm qatorlari: resurs tashlanadi, NULL fakt = null (0 emas)', () => {
    const r = hajmQatorlari([...ishlar, { nom: 'X', birlik: 'м2', fakt_hajm: null as unknown as number, kat: 'bl' }], new Map([[5, 40]]), [5, 6, 7]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ faktHajm: 45.5, aktHajmi: 40, formula: 'V = L × B × H' });
    expect(r[1].faktHajm).toBeNull();
  });
  it('lab ilovasi: beton sinfi + hajm; armatura; materiallar', () => {
    const l = labIlovaQur({ ish_nomi: 'Бетонирование плиты', ish_tavsifi: 'Бетонирование плиты', materiallar: 'Бетон В25 W6; Арматура Ø12 А500С' }, ishlar);
    expect(l?.talablar).toContain('beton');
    expect(l?.beton).toMatchObject({ sinf: 'B25', qoshimcha: 'W6', hajm: '45,5 м3' });
    expect(l?.armatura?.diametrlar).toEqual([12]);
    expect(l?.materiallar).toHaveLength(2);
    expect(labIlovaQur({ ish_nomi: '', materiallar: '' })).toBeNull();
  });
  it('material sertifikat joyi: bor bo\'lsa tegilmaydi', () => {
    expect(materiallarSertifikatBilan('Кирпич (серт. № 5); Песок')).toBe('Кирпич (серт. № 5); Песок (сертификат/паспорт № ______ от ________)');
  });
});

describe('Pechat kitobi', () => {
  const k = (raqam: string, o: Partial<AosrKirish> = {}): AosrKirish => ({
    raqam, sana: '2026-11-01', boshlanishSana: '2026-10-01', tugashSana: '2026-10-20', ishNomi: 'Бетонирование плиты', obyektNomi: 'Объект-1',
    ishTavsifi: 'Бетонирование плиты — 45,5 м3', materiallar: 'Бетон В25 W6', komissiya: [{ rol: 'smo', fio: 'Тестов Т.' }], ...o,
  });
  it('har akt alohida varaq; ilova varaqlari o\'z aktidan keyin; nomlar noyob', async () => {
    const lab = labIlovaQur({ ish_nomi: 'Бетонирование плиты', materiallar: 'Бетон В25 W6' }, [{ nom: 'Бетонирование', birlik: 'м3', fakt_hajm: 45.5, kat: 'bl' }]);
    const bytes = await aosrKitobExcel([
      k('1', { ilova: { hajm: hajmQatorlari([{ nom: 'Бетонирование плиты', birlik: 'м3', fakt_hajm: 45.5, kat: 'bl' }]), lab } }),
      k('2'), k('2'),
    ]);
    const wb = await yukla(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['АОСР 1', 'Объём 1', 'Прил 1', 'АОСР 2', 'АОСР 2 (2)']);
    const hajm = matnlar(wb.getWorksheet('Объём 1')!);
    expect(hajm).toContain('V = L × B × H');
    expect(hajm).toContain('45,5');
    const prl = matnlar(wb.getWorksheet('Прил 1')!);
    expect(prl).toContain('B25');
    expect(prl).toContain('Количество серий контрольных образцов');
  });
  it('sanasiz: sanalar bo\'sh chiziq; sanali — sana bor; shakl (komissiya, qaror, imzo) saqlanadi', async () => {
    const sanali = matnlar((await yukla(await aosrExcel(k('7')))).worksheets[0]);
    expect(sanali).toContain('«01» ноября 2026 г.');
    const sanasiz = matnlar((await yukla(await aosrExcel(k('7'), { sanasiz: true }))).worksheets[0]);
    expect(sanasiz).not.toContain('2026 г.');
    expect(sanasiz).toContain('«___» ______________ 20___ г.');
    expect(sanasiz).toContain('разрешается производство последующих работ');
    expect(sanasiz).toContain('Комиссия в составе:');
    expect(sanasizQil(k('1')).sana).toBeNull();
    expect(sanasiz).toContain('сертификат/паспорт'); // 3-bo'limda sertifikat joyi
  });
});
