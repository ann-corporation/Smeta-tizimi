import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { RasmiyVaraq, dizaynOqi, hujjatDizaynTekshir, joriyHujjatDizayni, rasmiyKitob, type RasmiyUstun } from '.';
import { balandlik, matnQatorSoni, qatorBalandligi, SUKUT_QATOR_PT } from './qator-balandlik';

/* Barcha ma'lumot SINTETIK. */

describe('qator balandligi hisoblagich (wrap + balandlik, shrink emas)', () => {
  it('bir qatorli matn — balandlik berilmaydi (sukut); uzun matn — qatorlar soniga qarab', () => {
    expect(balandlik('вода', 66)).toBeUndefined();
    expect(matnQatorSoni('слово '.repeat(40).trim(), 40)).toBeGreaterThan(3);
    const b3 = balandlik('слово '.repeat(40), 40, 13, 0)!;
    expect(b3).toBeGreaterThan(40);
    // dizayn chegarasi: eng ko'pi bilan N qator
    expect(balandlik('слово '.repeat(40), 40, 13, 3)).toBe(3 * 13 + 2);
  });

  it('sig‘magan uzun so‘z harf bo‘yicha bo‘linadi (shifr)', () => {
    expect(matnQatorSoni('А'.repeat(60), 10)).toBeGreaterThanOrEqual(5);
  });

  it('birlashgan (keng) katak torroq ustundan kam qator egallaydi', () => {
    const m = 'слово '.repeat(30).trim();
    expect(matnQatorSoni(m, 120)).toBeLessThan(matnQatorSoni(m, 30));
  });

  it('YASHIRIN ustun balandlikka ta’sir qilmaydi; son o‘ralmaydi', () => {
    const kalit = '1234567:abcdef0123456789abcdef0123456789';
    const tor = { matn: kalit, eni: 10 };
    expect(qatorBalandligi([{ matn: 'вода', eni: 66 }, { ...tor, yashirin: true }])).toBeUndefined();
    // yashirin EMAS bo'lsa — shu kalit qatorni semirtirardi
    expect(qatorBalandligi([{ matn: 'вода', eni: 66 }, tor])).toBeGreaterThan(SUKUT_QATOR_PT);
    expect(qatorBalandligi([{ matn: 123456789.123, eni: 3 }])).toBeUndefined();
  });
});

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 17, tur: 'kod' },
  { sarlavha: 'Наименование', kenglik: 66, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 10, tur: 'birlik' },
  { sarlavha: 'Сумма, сум', kenglik: 18, tur: 'pul' },
  { sarlavha: 'Тип', kenglik: 7, tur: 'birlik', belgi: true },
  { sarlavha: 'Кат.', kenglik: 8, tur: 'texnik', yashirin: true },
  { sarlavha: 'КАЛИТ', kenglik: 10, tur: 'texnik', yashirin: true },
];
const KALIT = '987654321:0123456789abcdef0123456789abcdef0123456789abcdef';
const UZUN = 'Устройство монолитных фундаментных плит с армированием, бетонированием и уходом за бетоном в опалубке '.repeat(3);

function kitob() {
  const v = new RasmiyVaraq({ nom: 'Т', sarlavha: 'ТЕСТ', ustunlar: USTUNLAR, yonalish: 'portrait' });
  v.bolim('Раздел');
  v.qator('oddiy', [1, 'ТСН-12', 'вода', 'м3', 1500, 'rs', 'МАТ', KALIT]);              // 3-qator: oddiy resurs
  v.qator('oddiy', [2, 'ТССЦ-101-0856-УЗУН-ШИФР-' + 'Х'.repeat(20), UZUN, 'м3', 1500, 'rs', 'МАТ', KALIT]);
  v.qator('vsego', [null, null, 'ВСЕГО', null, 3000, null, null, null]);
  return rasmiyKitob([v], { tur: 'f2' }).bytes;
}

describe('rasmiy varaq — yashirin ustun qoidasi', () => {
  const bytes = kitob();
  const o = dizaynOqi(bytes);
  const v = o.varaqlar[0];

  it('Тип / Кат. / КАЛИТ yashirin qoladi, o‘ralmaydi', () => {
    expect([5, 6, 7].map((c) => v.ustunlar[c].yashirin)).toEqual([true, true, true]);
    for (const q of v.qatorlar) for (const k of q.kataklar) if ([5, 6, 7].includes(k.col)) expect(o.xflar[k.s].wrap).toBe(false);
  });

  it('«вода» qatori — ODDIY balandlik (ht yo‘q), uzun KALIT qatorni semirtirmaydi', () => {
    const q = v.qatorlar.find((x) => x.kataklar.some((k) => k.matn === 'ВОДА'))!;
    expect(q.ht).toBeNull();
  });

  it('uzun nom — o‘ralgan va balandlik berilgan; shifr kichraymaydi (shrinkToFit yo‘q)', () => {
    const q = v.qatorlar.find((x) => x.kataklar.some((k) => (k.matn ?? '').startsWith('УСТРОЙСТВО')))!;
    expect(q.ht ?? 0).toBeGreaterThan(SUKUT_QATOR_PT);
    expect(o.xflar.some((xf) => xf.shrink)).toBe(false);
    const shifr = q.kataklar.find((k) => (k.matn ?? '').startsWith('ТССЦ'))!;
    expect(o.xflar[shifr.s].wrap).toBe(true);
  });

  it('son katagi o‘ralmaydi (tartib raqami ham)', () => {
    const q = v.qatorlar.find((x) => x.kataklar.some((k) => k.matn === 'ВОДА'))!;
    for (const k of q.kataklar) if (k.son != null) expect(o.xflar[k.s].wrap).toBe(false);
  });

  it('chop: A4, bir sahifa eniga, yo‘nalish, sarlavha qatorlari takrorlanadi; tekshiruv toza', () => {
    expect(v.chop).toEqual({ bittaEnli: true, yonalish: 'portrait', qogoz: '9' });
    expect(v.chopSarlavha).toBe(true);
    expect(hujjatDizaynTekshir(bytes, joriyHujjatDizayni())).toEqual([]);
  });
});

/** styles.xml / sheet XML ni o'zgartirib, tekshiruv buzilishni TOPISHINI isbotlaydi (tekshiruvning o'zi sinovi). */
function buz(bytes: Uint8Array, f: (fayl: string, xml: string) => string): Uint8Array {
  const z = unzipSync(bytes);
  for (const k of Object.keys(z)) if (/\.xml$/.test(k)) z[k] = strToU8(f(k, strFromU8(z[k])));
  return zipSync(z);
}

describe('dizayn tekshiruvi — yangi qoidalar buzilganda yiqiladi', () => {
  const d = joriyHujjatDizayni();
  const asl = kitob();

  it('shrinkToFit topiladi', () => {
    const b = buz(asl, (k, x) => (k === 'xl/styles.xml' ? x.replace(/wrapText="1"/g, 'shrinkToFit="1"') : x));
    expect(hujjatDizaynTekshir(b, d).join('\n')).toMatch(/shrinkToFit/);
  });

  it('yashirin ustun katagi o‘ralgan bo‘lsa topiladi', () => {
    // H (Тип, yashirin) ustun katagi uslubi o'ralgan uslubga (7 = matn) almashtiriladi
    const b2 = buz(asl, (k, x) => (k.startsWith('xl/worksheets/') ? x.replace(/<c r="H(\d+)" s="(\d+)"/, (_m, r: string) => `<c r="H${r}" s="7"`) : x));
    expect(hujjatDizaynTekshir(b2, d).join('\n')).toMatch(/yashirin ustun katagi o'ralgan/);
  });

  it('o‘ralgan matn uchun balandlik berilmasa topiladi', () => {
    const b = buz(asl, (k, x) => (k.startsWith('xl/worksheets/') ? x.replace(/ ht="[\d.]+" customHeight="1"/g, '') : x));
    expect(hujjatDizaynTekshir(b, d).join('\n')).toMatch(/balandlik berilmagan/);
  });

  it('chop sozlamasi yo‘q bo‘lsa topiladi', () => {
    const b = buz(asl, (k, x) => (k.startsWith('xl/worksheets/') ? x.replace(/ fitToWidth="1"/, '').replace('<pageSetUpPr fitToPage="1"/>', '') : x));
    expect(hujjatDizaynTekshir(b, d).join('\n')).toMatch(/chop — bir sahifa eniga/);
  });

  it('Print_Titles yo‘q bo‘lsa topiladi', () => {
    const b = buz(asl, (k, x) => (k === 'xl/workbook.xml' ? x.replace(/<definedName name="_xlnm\.Print_Titles"[^>]*>[^<]*<\/definedName>/, '') : x));
    expect(hujjatDizaynTekshir(b, d).join('\n')).toMatch(/Print_Titles/);
  });
});
