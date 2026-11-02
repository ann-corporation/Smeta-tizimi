import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { RasmiyVaraq, rasmiyKitob } from './rasmiy';
import { imzoTomonlari } from './imzo';
import { kolontitulBolimlari, tizimImzoKodi, tizimImzosiniQoy, varaqqaTizimImzosi } from './tizim-imzo';
import { unEsc } from './ooxml';

const VAQT = new Date(2026, 9, 27, 18, 30);
const META = { hujjat: 'F2_Obyekt_№5_2026-10.xlsx', foydalanuvchi: 'pto@new-times.uz', vaqt: VAQT };

function kitob(summa = 1000) {
  const v = new RasmiyVaraq({
    nom: 'Форма 2', sarlavha: 'АКТ ВЫПОЛНЕННЫХ РАБОТ',
    ustunlar: [
      { sarlavha: '№', kenglik: 6, tur: 'tartib' },
      { sarlavha: 'Наименование', kenglik: 40, tur: 'matn' },
      { sarlavha: 'Сумма', kenglik: 16, tur: 'pul' },
    ],
  });
  v.qator('oddiy', [1, 'Бетон & арматура', summa]);
  v.qator('vsego', [null, 'ВСЕГО', { f: 'SUM(C6:C6)', v: summa }]);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК']));
  return rasmiyKitob([v]).bytes;
}

const fayllar = (b: Uint8Array) => unzipSync(b);
const matn = (b: Uint8Array, p: string) => strFromU8(fayllar(b)[p]);
const footer = (xml: string, tag = 'oddFooter') => unEsc((xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] ?? '');
const kolontitulsiz = (xml: string) => xml.replace(/<headerFooter\b[\s\S]*?<\/headerFooter>/, '');

describe('Tizim imzosi — har hujjat kolontitul + xususiyat oladi', () => {
  it('rasmiy hujjat (F2/F3/LRV yadrosi): chap — brend, markaz — sahifa raqami saqlanadi, o‘ng — kim/qachon/kod', () => {
    const b = tizimImzosiniQoy(kitob(), META);
    const f = footer(matn(b, 'xl/worksheets/sheet1.xml'));
    const q = kolontitulBolimlari(f);
    expect(q.L).toContain('Smeta tizimi · smeta-tizimi.pages.dev');
    expect(q.L).toContain('F2_Obyekt_№5_2026-10');
    expect(q.C).toBe(kolontitulBolimlari(footer(matn(kitob(), 'xl/worksheets/sheet1.xml'))).C);
    expect(q.C).toContain('Страница &P из &N');
    expect(q.R).toContain('pto@new-times.uz · 27.10.2026 18:30 · Код ');
    expect(q.R).toMatch(/Код [0-9A-Z]{5}-[0-9A-Z]{5}$/);
    expect(f.length).toBeLessThanOrEqual(255);
  });

  it('maket o‘zgarmaydi: kataklar, birlashmalar, chop sozlamalari, imzo bloki, Print_Area aynan', () => {
    const asl = kitob();
    const b = tizimImzosiniQoy(asl, META);
    expect(kolontitulsiz(matn(b, 'xl/worksheets/sheet1.xml'))).toBe(kolontitulsiz(matn(asl, 'xl/worksheets/sheet1.xml')));
    expect(matn(b, 'xl/workbook.xml')).toBe(matn(asl, 'xl/workbook.xml'));
    expect(matn(b, 'xl/styles.xml')).toBe(matn(asl, 'xl/styles.xml'));
    expect(matn(b, 'xl/worksheets/sheet1.xml')).toContain('ЗАКАЗЧИК:');
  });

  it('hujjat xususiyatlari: Creator, Company, Application, LastModifiedBy, Description — kod bilan', () => {
    const b = tizimImzosiniQoy(kitob(), META);
    const core = matn(b, 'docProps/core.xml');
    const app = matn(b, 'docProps/app.xml');
    const kod = tizimImzoKodi(b);
    expect(core).toContain('<dc:creator>Smeta tizimi</dc:creator>');
    expect(core).toContain('<dc:title>Форма 2</dc:title>');
    expect(core).toContain('<cp:lastModifiedBy>pto@new-times.uz</cp:lastModifiedBy>');
    expect(core).toContain(`Код проверки ${kod}`);
    expect(app).toContain('<Company>Smeta tizimi · smeta-tizimi.pages.dev</Company>');
    expect(app).toContain('<Application>Smeta tizimi</Application>');
    const ct = matn(b, '[Content_Types].xml');
    expect(ct).toContain('PartName="/docProps/app.xml"');
    expect(matn(b, '_rels/.rels')).toContain('Target="docProps/app.xml"');
  });

  it('kod barqaror: bir xil hujjat → bir xil kod; qayta imzolash kodni va kolontitulni takrorlamaydi; boshqa mazmun → boshqa kod', () => {
    const a = tizimImzosiniQoy(kitob(), META);
    const b = tizimImzosiniQoy(kitob(), { ...META, foydalanuvchi: 'boshqa', vaqt: new Date(2027, 0, 1) });
    expect(tizimImzoKodi(a)).toBe(tizimImzoKodi(b));
    expect(tizimImzoKodi(a)).toBe(tizimImzoKodi(kitob()));
    const qayta = tizimImzosiniQoy(a, META);
    const f = footer(matn(qayta, 'xl/worksheets/sheet1.xml'));
    expect(f.match(/smeta-tizimi\.pages\.dev/g)).toHaveLength(1);
    expect(f.match(/Код /g)).toHaveLength(1);
    expect(tizimImzoKodi(tizimImzosiniQoy(kitob(2000), META))).not.toBe(tizimImzoKodi(a));
  });

  it('shablonning pastki chap/o‘ng qismi band bo‘lsa — imzo yuqori kolontitulga, shablon matni saqlanadi', () => {
    const xml = '<worksheet xmlns="x"><sheetData/><pageMargins left="0.7"/><headerFooter><oddFooter>&amp;LИсп. Иванов&amp;RЛист &amp;P</oddFooter></headerFooter></worksheet>';
    const y = varaqqaTizimImzosi(xml, { chap: 'Smeta tizimi · smeta-tizimi.pages.dev', ong: 'Код ABCDE-12345' });
    expect(footer(y)).toBe('&LИсп. Иванов&RЛист &P');
    expect(kolontitulBolimlari(footer(y, 'oddHeader')).L).toContain('smeta-tizimi.pages.dev');
    expect(y.indexOf('<oddHeader>')).toBeLessThan(y.indexOf('<oddFooter>'));
  });

  it('kolontitul yo‘q varaqqa to‘g‘ri tartibda qo‘shiladi; differentFirst bo‘lsa birinchi sahifaga ham', () => {
    const x1 = '<worksheet xmlns="x"><sheetData/><pageSetup paperSize="9"/><drawing r:id="rId1"/></worksheet>';
    const y1 = varaqqaTizimImzosi(x1, { chap: 'A smeta-tizimi.pages.dev', ong: 'B' });
    expect(y1.indexOf('<headerFooter>')).toBeGreaterThan(y1.indexOf('<pageSetup'));
    expect(y1.indexOf('<headerFooter>')).toBeLessThan(y1.indexOf('<drawing'));
    const x2 = '<worksheet xmlns="x"><sheetData/><headerFooter differentFirst="1"/></worksheet>';
    const y2 = varaqqaTizimImzosi(x2, { chap: 'A smeta-tizimi.pages.dev', ong: 'B' });
    expect(footer(y2, 'firstFooter')).toContain('smeta-tizimi.pages.dev');
    expect(footer(y2, 'oddFooter')).toContain('smeta-tizimi.pages.dev');
  });

  it('exceljs bilan yasalgan hujjat (forma2/forma3/nakopitelniy eksportlari) ham imzolanadi', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Лист1');
    ws.getCell('A1').value = 'СЧЕТ-ФАКТУРА';
    const b = tizimImzosiniQoy(new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer), META);
    const p = Object.keys(fayllar(b)).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))!;
    expect(footer(matn(b, p))).toContain('smeta-tizimi.pages.dev');
    expect(matn(b, 'docProps/core.xml')).toContain('<dc:creator>Smeta tizimi</dc:creator>');
  });

  it('zip paket (F2 oylik paket) — ichidagi har xlsx imzolanadi; boshqa fayllar tegilmaydi', () => {
    const paket = zipSync({ 'F2/akt.xlsx': kitob(), 'izoh.txt': strToU8('salom') });
    const b = tizimImzosiniQoy(paket, { foydalanuvchi: 'x', vaqt: VAQT });
    const f = fayllar(b);
    expect(strFromU8(f['izoh.txt'])).toBe('salom');
    expect(footer(strFromU8(unzipSync(f['F2/akt.xlsx'])['xl/worksheets/sheet1.xml']))).toContain('pages.dev · akt');
  });

  it('xlsx bo‘lmagan fayl (json, pdf, buzilgan) o‘zgarishsiz qaytadi — berish to‘xtamaydi', () => {
    const j = strToU8('{"a":1}');
    expect(tizimImzosiniQoy(j, META)).toBe(j);
    const buzuq = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(tizimImzosiniQoy(buzuq, META)).toBe(buzuq);
  });
});
