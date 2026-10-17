import { beforeEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur } from './f2-tayyor';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS, NAMUNA_NAKRUTKA } from './f2-hujjat.fixture';
import { hujjatTokenBilan, varaqYacheykaSoni, xlsxYacheykaSoni } from './token-hujjat';

// Egasi 2026-10-17: "tizim faqat o'zi hisob qilib yozganini sanasin; tayyor hujjatdan olingan narsa yacheyka emas".
const varaqXml = (kataklar: string) => strToU8(`<worksheet><sheetData><row r="1">${kataklar}</row></sheetData></worksheet>`);
const xlsx = (kataklar: string) => zipSync({ 'xl/worksheets/sheet1.xml': varaqXml(kataklar), 'xl/workbook.xml': strToU8('<workbook/>') });
const formulalar = (n: number, dan = 1) => Array.from({ length: n }, (_, i) => `<c r="A${dan + i}"><f>B${dan + i}*2</f><v>${i}</v></c>`).join('');

describe('token-hujjat — faqat tizim hisoblagan kataklar', () => {
  it('F2: matn va ko‘chirilgan sonlar sanalmaydi — faqat formula; rasmiy yozuvchi bilan aynan teng', () => {
    const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
    const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
    const h = f2Hujjat(b, q, { obyektNom: 'X', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 });
    // 43 qatorli real F2: 792 to'ldirilgan katakning 394 tasi matn, 185 tasi ko'chirilgan son — ular sanalmaydi.
    expect(h.yacheykalar).toBe(213);
    expect(xlsxYacheykaSoni(h.bytes)).toBe(h.yacheykalar);
  });

  it('formulasiz (tasdiqlangan) F2 da ham hisob sanaladi — formulalar qiymatga aylanishidan oldin', () => {
    const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
    const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
    const oddiy = f2Hujjat(b, q, { obyektNom: 'X', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 });
    const formulasiz = f2Hujjat(b, q, { obyektNom: 'X', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12, formulasiz: true });
    expect(formulasiz.yacheykalar).toBe(oddiy.yacheykalar);
    expect(xlsxYacheykaSoni(formulasiz.bytes)).toBe(0);   // faylda formula yo'q — shuning uchun yozuvchi sonini uzatamiz
  });

  it('faqat formula bor katak: matn, son, uslubli bo‘sh katak sanalmaydi', () => {
    const xml = '<sheetData><row r="1">'
      + '<c r="A1" s="1"/>'
      + '<c r="B1" t="s"><v>3</v></c>'
      + '<c r="C1"><f>B1*2</f><v>6</v></c>'
      + '<c r="D1" t="inlineStr"><is><t>ИТОГО</t></is></c>'
      + '<c r="E1"><v>125000</v></c>'
      + '<c r="F1" s="2"></c>'
      + '<c r="G1" t="str"><f>"Итого: "&amp;C1</f><v>Итого: 6</v></c>'
      + '</row></sheetData>';
    expect(varaqYacheykaSoni(xml)).toBe(2);
  });

  it('foydalanuvchining asl fayli (oferta): o‘zgarmagan katak sanalmaydi, faqat tizim qo‘shgan/o‘zgartirgani', () => {
    const asl = formulalar(10);                                           // smetachining 10 ta o'z formulasi
    const yangi = asl.replace('<f>B3*2</f>', '<f>B3*2*1.12</f>')          // tizim bitta formulani o'zgartirdi
      + formulalar(4, 20);                                                // va 4 ta yangi hisob qo'shdi
    expect(xlsxYacheykaSoni(xlsx(yangi))).toBe(14);
    expect(xlsxYacheykaSoni(xlsx(yangi), xlsx(asl))).toBe(5);
    expect(xlsxYacheykaSoni(xlsx(asl), xlsx(asl))).toBe(0);
  });

  it('zip paket — ichidagi har xlsx yig‘iladi; noto‘g‘ri fayl — 0', () => {
    expect(xlsxYacheykaSoni(zipSync({ 'a.xlsx': xlsx(formulalar(4)), 'b.xlsx': xlsx(formulalar(5)), 'izoh.txt': strToU8('x') }))).toBe(9);
    expect(xlsxYacheykaSoni(new Uint8Array([1, 2, 3]))).toBe(0);
  });
});

describe('hujjatTokenBilan — avval token, keyin fayl', () => {
  // Oddiy yozib oluvchi soxta `tokenBilan` (server javobini beradi; muvaffaqiyatda ishni bajaradi).
  let javob: Record<string, unknown> = {};
  let chaqiruvlar: unknown[] = [];
  const tokenBilan = async (p: unknown, ish: () => Promise<unknown>) => {
    chaqiruvlar.push(p);
    return javob.ok === false ? javob : { ok: true, natija: await ish(), ...javob };
  };
  const d = { tokenBilan, mazmunXeshi: async () => 'xesh123' } as unknown as Parameters<typeof hujjatTokenBilan>[2];
  beforeEach(() => { javob = {}; chaqiruvlar = []; });

  it('token yechilgach fayl beriladi; meta isbot bilan', async () => {
    javob = { sarflandi: 130, bepulTakror: false, hisob: { yakuniy_som: 13000 } };
    let berildi = 0;
    const r = await hujjatTokenBilan({ kompaniyaId: 5, bytes: new Uint8Array([1]), hujjat: 'F3', sabab: 'Форма №3 · Obyekt', obyekt: 9, yacheykalar: 240 }, () => { berildi++; }, d);
    expect(berildi).toBe(1);
    expect(chaqiruvlar[0]).toEqual({ kompaniyaId: 5, amal: 'hujjat', birlikSoni: 240,
      meta: { hujjat: 'F3', sabab: 'Форма №3 · Obyekt', yacheyka: 240, sanoq: 'formula', xesh: 'xesh123', obyekt: 9 } });
    expect(r).toMatchObject({ ok: true, sarflandi: 130, yacheykalar: 240 });
    if (r.ok) expect(r.xabar).toContain('130 token');
  });

  it('token yetmasa fayl BERILMAYDI', async () => {
    javob = { ok: false, xabar: 'Token yetmaydi: kerak 130, balans 4.' };
    let berildi = 0;
    const r = await hujjatTokenBilan({ kompaniyaId: 5, bytes: new Uint8Array([1]), hujjat: 'M-29', sabab: 'M-29', yacheykalar: 50 }, () => { berildi++; }, d);
    expect(berildi).toBe(0);
    expect(r).toEqual({ ok: false, xabar: 'Token yetmaydi: kerak 130, balans 4.' });
  });

  it('aynan shu hujjat qayta — bepul deb aytiladi', async () => {
    javob = { sarflandi: 0, bepulTakror: true };
    const r = await hujjatTokenBilan({ kompaniyaId: 5, bytes: new Uint8Array([1]), hujjat: 'F3', sabab: 'F3', yacheykalar: 1 }, () => undefined, d);
    expect(r).toMatchObject({ ok: true, bepulTakror: true, xabar: 'Bu hujjat avval to‘langan — qayta yuklash bepul' });
  });
});
