// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  IMZO_BOSH_XESH, b64uKodla, b64uOch, barmoqIzi, imzoMazmunToTogri, imzoTekshir, imzoXabar, imzoXeshi, ochiqKalitYaroqli,
  qisqaKod, sha256Hex, tasodifiyToken, tokenMi, type ImzoMazmun,
} from './yadro';
import ExcelJS from 'exceljs';
import { hujjatMazmunXeshi, mazmunFarqi, xlsxKanonik, xlsxMi } from './mazmun';

const KALIT_ID = '0b9d1c5e-3a47-4f60-9d4e-2a7c5e8f1b30';
const HEX = 'a'.repeat(64);

async function kalitJufti() {
  const j = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const ochiq = b64uKodla(new Uint8Array(await crypto.subtle.exportKey('raw', j.publicKey)));
  return { j, ochiq };
}
const imzola = async (k: CryptoKey, x: Uint8Array) => b64uKodla(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, x as BufferSource)));

const mazmun = (o: Partial<ImzoMazmun> = {}): ImzoMazmun => ({
  kompaniya_id: 7, hujjat_id: 42, hujjat_sha256: HEX, mazmun_xesh: 'b'.repeat(64), kalit_id: KALIT_ID, foydalanuvchi_id: 9,
  imzolovchi: 'Test Imzochi', rol: 'pto', usul: 'tizim', tomon: 'texnadzor', imzolovchi_kompaniya_id: 7, imzolovchi_kompaniya: 'Test MChJ', nomidan_kompaniya_id: 8, nomidan_kompaniya: 'Buyurtmachi MChJ', vaqt: '2026-12-18T09:30:00.123Z', nonce: tasodifiyToken(), oldingi_xesh: IMZO_BOSH_XESH, ...o,
});

describe('shaxsiy imzo yadrosi: kriptografiya', () => {
  it('to\'g\'ri imzo o\'tadi; ochiq kalit 65 bayt = 87 belgi', async () => {
    const { j, ochiq } = await kalitJufti();
    expect(ochiq).toHaveLength(87);
    expect(await ochiqKalitYaroqli(ochiq)).toBe(true);
    const x = imzoXabar(mazmun());
    expect(await imzoTekshir(ochiq, x, await imzola(j.privateKey, x))).toBe(true);
  });

  it('xabarning BIR bayti o\'zgarsa - rad (hujjat xeshi, imzolovchi, rol, vaqt, zanjir)', async () => {
    const { j, ochiq } = await kalitJufti();
    const m = mazmun();
    const imzo = await imzola(j.privateKey, imzoXabar(m));
    for (const o of [{ hujjat_sha256: 'c'.repeat(64) }, { mazmun_xesh: 'd'.repeat(64) }, { imzolovchi: 'Boshqa Odam' }, { rol: 'boss' }, { usul: 'eri' }, { tomon: 'buyurtmachi' }, { imzolovchi_kompaniya: 'Boshqa MChJ' }, { imzolovchi_kompaniya_id: 9 }, { nomidan_kompaniya: 'Soxta' }, { nomidan_kompaniya_id: null, nomidan_kompaniya: null },
      { vaqt: '2026-12-18T09:30:00.124Z' }, { oldingi_xesh: 'e'.repeat(64) }, { hujjat_id: 43 }, { kompaniya_id: 8 }, { foydalanuvchi_id: 10 }, { nonce: tasodifiyToken() }] as Partial<ImzoMazmun>[]) {
      expect(await imzoTekshir(ochiq, imzoXabar({ ...m, ...o }), imzo), JSON.stringify(o)).toBe(false);
    }
  });

  it('imzoning bir bayti o\'zgarsa yoki boshqa kalit bilan tekshirilsa - rad', async () => {
    const a = await kalitJufti(); const b = await kalitJufti();
    const x = imzoXabar(mazmun());
    const imzo = await imzola(a.j.privateKey, x);
    expect(await imzoTekshir(b.ochiq, x, imzo)).toBe(false);
    const bayt = b64uOch(imzo)!; bayt[10] ^= 1;
    expect(await imzoTekshir(a.ochiq, x, b64uKodla(bayt))).toBe(false);
  });

  it('buzuq kirish istisno chiqarmaydi: noto\'g\'ri uzunlik, egri chiziqda yotmagan nuqta, bo\'sh', async () => {
    const { ochiq } = await kalitJufti();
    const x = imzoXabar(mazmun());
    expect(await imzoTekshir(ochiq, x, '')).toBe(false);
    expect(await imzoTekshir(ochiq, x, 'A'.repeat(86))).toBe(false);
    expect(await imzoTekshir('', x, 'A'.repeat(86))).toBe(false);
    const nuqta = new Uint8Array(65); nuqta[0] = 4; nuqta[1] = 1;   // (1, 0) P-256 da yo'q
    expect(await ochiqKalitYaroqli(b64uKodla(nuqta))).toBe(false);
    expect(await ochiqKalitYaroqli(b64uKodla(new Uint8Array(33)))).toBe(false);
  });

  it('xabar kanonik va domen bilan ajratilgan; zanjir xeshi barqaror', async () => {
    const m = mazmun({ nonce: 'A'.repeat(22) });
    expect(new TextDecoder().decode(imzoXabar(m)).startsWith('T2-IMZO-V1\n[7,42,')).toBe(true);
    expect(await imzoXeshi(m)).toBe(await imzoXeshi({ ...m }));
    expect(await imzoXeshi(m)).not.toBe(await imzoXeshi({ ...m, rol: 'boss' }));
  });

  it('tuzilma tekshiruvi: yomon maydonlar rad', () => {
    expect(imzoMazmunToTogri(mazmun())).toBe(true);
    for (const o of [{ hujjat_sha256: 'xyz' }, { kalit_id: 'x' }, { vaqt: '2026-12-18 09:30' }, { nonce: 'qisqa' }, { imzolovchi: '' }, { hujjat_id: 0 }, { oldingi_xesh: 'A'.repeat(64) }, { usul: 'x' as never }, { tomon: 'kimdir' as never }, { nomidan_kompaniya: null }, { imzolovchi_kompaniya: '' }] as Partial<ImzoMazmun>[])
      expect(imzoMazmunToTogri(mazmun(o)), JSON.stringify(o)).toBe(false);
  });

  it('token 22 belgi, har safar boshqa; barmoq izi barqaror', async () => {
    const a = tasodifiyToken(); const b = tasodifiyToken();
    expect(tokenMi(a)).toBe(true); expect(a).not.toBe(b);
    const { ochiq } = await kalitJufti();
    expect(await barmoqIzi(ochiq)).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
    expect(await barmoqIzi(ochiq)).toBe(await barmoqIzi(ochiq));
  });
});

describe('kanonik mazmun xeshi (fayl baytlari emas)', () => {
  async function kitob(son = 1000, nom = 'Beton ishlari', imzoVaraq = false) {
    const wb = new ExcelJS.Workbook();
    const v = wb.addWorksheet('F2');
    v.addRow(['Kod', 'Nom', 'Birlik', 'Hajm', 'Narx', 'Summa']);
    v.addRow(['A-1', nom, 'm3', 12.5, son, { formula: 'D2*E2', result: 12.5 * son }]);
    v.addRow(['Jami', '', '', '', '', { formula: 'SUM(F2:F2)', result: 12.5 * son }]);
    if (imzoVaraq) wb.addWorksheet('IMZO').addRow(['Imzo bloki', 'QR']);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }
  const qaytaSaqla = async (b: Uint8Array) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b as never); wb.getWorksheet('F2')!.getCell('A5').value = null; return new Uint8Array(await wb.xlsx.writeBuffer()); };

  it('qayta saqlash (baytlar o\'zgaradi) mazmun xeshini O\'ZGARTIRMAYDI; IMZO varag\'i qo\'shilsa ham', async () => {
    const asl = await kitob();
    const qayta = await qaytaSaqla(asl);
    expect(await sha256Hex(qayta)).not.toBe(await sha256Hex(asl));        // baytlar haqiqatan boshqa
    expect(await hujjatMazmunXeshi(qayta)).toBe(await hujjatMazmunXeshi(asl));
    expect(await hujjatMazmunXeshi(await kitob(1000, 'Beton ishlari', true))).toBe(await hujjatMazmunXeshi(asl));
  });

  it('bitta raqam yoki matn o\'zgarsa xesh o\'zgaradi va farq QAYSI katak/qator ekanini ko\'rsatadi', async () => {
    const asl = await kitob(); const ozgargan = await kitob(1001);
    expect(await hujjatMazmunXeshi(ozgargan)).not.toBe(await hujjatMazmunXeshi(asl));
    const f = mazmunFarqi(xlsxKanonik(asl)!, xlsxKanonik(ozgargan)!);
    expect(f.map((x) => [x.varaq, x.katak, x.qator, x.eski, x.yangi])).toEqual([
      ['F2', 'E2', 2, '1000', '1001'], ['F2', 'F2', 2, '12500', '12512.5'], ['F2', 'F3', 3, '12500', '12512.5']]);
    const nomF = mazmunFarqi(xlsxKanonik(asl)!, xlsxKanonik(await kitob(1000, 'Beton'))!);
    expect(nomF).toEqual([{ varaq: 'F2', katak: 'B2', qator: 2, eski: 'Beton ishlari', yangi: 'Beton' }]);
  });

  it('xlsx bo\'lmagan fayl: bayt xeshi (docx/zip hammasi bir xil chiqib qolmasin); xlsxMi', async () => {
    const b = strToU8('oddiy matn'); const z = zipSync({ 'word/document.xml': strToU8('A') }); const z2 = zipSync({ 'word/document.xml': strToU8('B') });
    expect(await hujjatMazmunXeshi(b)).toBe(await sha256Hex(b));
    expect(await hujjatMazmunXeshi(z)).not.toBe(await hujjatMazmunXeshi(z2));
    expect(xlsxMi(await kitob())).toBe(true); expect(xlsxMi(z)).toBe(false); expect(xlsxMi(b)).toBe(false);
    expect(xlsxKanonik(z)).toBeNull();
  });

  it('qisqa imzo kodi: 10 belgi, barqaror, xeshga bog\'liq', () => {
    expect(qisqaKod('0'.repeat(64))).toBe('00000-00000');
    expect(qisqaKod('a1b2c3d4e5f60718' + '0'.repeat(48))).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(qisqaKod('a'.repeat(64))).not.toBe(qisqaKod('b'.repeat(64)));
  });
});