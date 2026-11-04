import { afterEach, describe, expect, it } from 'vitest';
import {
  DIZAYN_PRESETLAR, RasmiyVaraq, dizaynOqi, dizaynTozala, hujjatDizayniniSaqla, hujjatDizaynTekshir, rasmiyKitob,
  type HujjatDizayn, type RasmiyUstun,
} from '.';
import { uslubniOch } from './rasmiy';

afterEach(() => { hujjatDizayniniSaqla(null); });

/** Namuna hujjat (uydirma sonlar): razdel, BL, RS, MAT, OB, jami, ВСЕГО — barcha darajalar. */
const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№', kenglik: 5, tur: 'tartib' },
  { sarlavha: 'Шифр', kenglik: 10, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 22, tur: 'matn' },
  { sarlavha: 'Ед.', kenglik: 6, tur: 'birlik' },
  { sarlavha: 'Количество', kenglik: 8, tur: 'hajm' },
  { sarlavha: 'Цена', kenglik: 8, tur: 'narx' },
  { sarlavha: 'Сумма, сум', kenglik: 8, tur: 'pul' },
  { sarlavha: 'Тип', kenglik: 6, tur: 'birlik', belgi: true },
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
];
const UZUN = 'Устройство монолитных фундаментных плит с армированием и бетонированием в опалубке';
const KATTA_SON = 123456789012.345;

function namuna(dizayn?: HujjatDizayn, mavzu?: 'rangsiz'): Uint8Array {
  const v = new RasmiyVaraq({ nom: 'Т', sarlavha: 'ТЕСТ', ustunlar: USTUNLAR, yonalish: 'landscape', dizayn });
  v.bolim('Раздел А');
  for (let g = 0; g < 2; g++) {
    v.qator('ish', [g * 4 + 1, 'Е1-1', UZUN, 'м3', 12.5, null, 1234.5, 'bl', ''], { daraja: 1 });
    v.qator('oddiy', [g * 4 + 2, 'Р-1', 'Затраты труда', 'чел-ч', 3, 1500.5, 4501.5, 'rs', 'ЧЕЛ'], { daraja: 2, rang: 'ЧЕЛ' });
    v.qator('oddiy', [g * 4 + 3, 'М-1', 'Бетон', 'м3', 2.25, KATTA_SON, 1000, 'mat', 'МАТ'], { daraja: 2, rang: 'МАТ' });
    v.qator('oddiy', [g * 4 + 4, 'О-1', 'Оборудование', 'шт', 1, 10, 10, 'ob', 'ОБ'], { daraja: 2, rang: 'ОБ' });
  }
  v.qator('jami', [null, null, 'Итого по разделу', null, null, null, 2000, null, null]);
  v.qator('vsego', [null, null, 'ВСЕГО', null, null, null, 2000, null, null]);
  return rasmiyKitob([v], { mavzu }).bytes;
}

type Oqildi = ReturnType<typeof dizaynOqi>;
const katak = (o: Oqildi, matn: string) => {
  for (const q of o.varaqlar[0].qatorlar) for (const k of q.kataklar) if (k.matn === matn.toLocaleUpperCase('ru-RU') || k.matn === matn) return { k, q, xf: o.xflar[k.s] };
  throw new Error('katak topilmadi: ' + matn);
};
const font = (o: Oqildi, matn: string) => o.fontlar[katak(o, matn).xf.fontId];

describe('hujjat dizayni — daraja uslublari (sukut: Kontrastli)', () => {
  const baytlar = namuna();
  const o = dizaynOqi(baytlar);

  it('«Тип» belgi ustuni sukut bo‘yicha yashirin; dizayn tekshiruvi toza', () => {
    const hdr = katak(o, 'Тип');
    expect(o.varaqlar[0].ustunlar[hdr.k.col].yashirin).toBe(true);
    expect(hujjatDizaynTekshir(baytlar, DIZAYN_PRESETLAR.kontrastli)).toEqual([]);
  });

  it('BL qalin, RS kursiv (kichikroq, kulrang), MAT va OB qalin, razdel va jami qalin', () => {
    expect(font(o, 'Устройство монолитных фундаментных плит с армированием и бетонированием в опалубке')).toMatchObject({ qalin: true, kursiv: false });
    expect(font(o, 'Затраты труда')).toMatchObject({ qalin: false, kursiv: true, rang: '595959' });
    expect(font(o, 'Затраты труда').sz).toBeLessThan(font(o, 'Бетон').sz);
    expect(font(o, 'Бетон')).toMatchObject({ qalin: true, kursiv: false });
    expect(font(o, 'Оборудование')).toMatchObject({ qalin: true, kursiv: false });
    expect(font(o, 'Раздел А')).toMatchObject({ qalin: true });
    expect(font(o, 'Раздел А').sz).toBeGreaterThan(font(o, 'Бетон').sz);
    expect(font(o, 'Итого по разделу').qalin).toBe(true);
    expect(font(o, 'ВСЕГО').qalin).toBe(true);
  });

  it('har daraja qatorida BARCHA ustunlarda (sonlarda ham) to‘rt tomonlama ingichka ramka', () => {
    const korinadigan = o.varaqlar[0].ustunlar.map((u, i) => (u.yashirin ? -1 : i)).filter((i) => i >= 0);
    let tekshirildi = 0;
    for (const q of o.varaqlar[0].qatorlar) {
      const darajali = q.kataklar.filter((k) => k.daraja && k.daraja !== 'rz');
      if (!darajali.length) continue;
      expect(darajali.map((k) => k.col)).toEqual(expect.arrayContaining(korinadigan));
      for (const k of darajali) {
        const b = o.chegaralar[o.xflar[k.s].borderId];
        expect(b.l && b.r && b.t !== '' && b.b !== '').toBe(true);
      }
      tekshirildi++;
    }
    expect(tekshirildi).toBeGreaterThanOrEqual(10);
  });

  it('BL yuqori chizig‘i qalinroq, jami/ВСЕГО yuqorisida qo‘sh chiziq', () => {
    expect(o.chegaralar[katak(o, 'Е1-1').xf.borderId].t).toBe('medium');
    expect(o.chegaralar[katak(o, 'Итого по разделу').xf.borderId].t).toBe('double');
    expect(o.chegaralar[katak(o, 'ВСЕГО').xf.borderId].t).toBe('double');
    expect(o.chegaralar[katak(o, 'Затраты труда').xf.borderId].t).toBe('thin');
  });

  it('darajalar fonlari bir-biridan farq qiladi (kulrang shkalada ham); BL oq, RS fonsiz', () => {
    const fon = (m: string) => o.fonlar[katak(o, m).xf.fillId];
    const razdel = fon('Раздел А'); const mat = fon('Бетон'); const ob = fon('Оборудование'); const jami = fon('Итого по разделу'); const vsego = fon('ВСЕГО');
    expect(new Set([razdel, mat, ob, jami, vsego]).size).toBe(5);
    expect(fon('Е1-1')).toBe('FFFFFF');
    expect(o.fonlar[katak(o, 'Затраты труда').xf.fillId]).toBeNull();
  });

  it('nomlar daraja bo‘yicha otstup: razdel 0, BL 1, RS 2', () => {
    expect(katak(o, 'Раздел А').xf.indent).toBe(0);
    expect(katak(o, UZUN).xf.indent).toBe(1);
    expect(katak(o, 'Затраты труда').xf.indent).toBe(2);
    expect(katak(o, 'Бетон').xf.indent).toBe(2);
  });

  it('ustun eng uzun formatlangan sondan tor emas (### bo‘lmaydi)', () => {
    const pulUstun = 5; // narx ustuni (eng katta son shu yerda)
    const eni = o.varaqlar[0].ustunlar[pulUstun].kenglik;
    // 123 456 789 012,35 → 14 belgi (3 minglik ajratgich + 2 o‘nlik)
    expect(eni).toBeGreaterThanOrEqual('123,456,789,012.35'.length);
    expect(o.varaqlar[0].ustunlar[2].kenglik).toBe(22);
  });

  it('uzun nom o‘raladi va qator balandligi o‘ralgan qatorlarga yetadi', () => {
    const { xf, q } = katak(o, UZUN);
    expect(xf.wrap).toBe(true);
    expect(q.ht).not.toBeNull();
    expect(q.ht!).toBeGreaterThanOrEqual(13 * Math.ceil(UZUN.length / 22 / 1.15 / 1.3));
  });
});

describe('hujjat dizayni — kompaniya sozlamasi qo‘llanadi', () => {
  const maxsus: HujjatDizayn = dizaynTozala({
    preset: 'maxsus', tipKorsat: true, xonaPul: 0, xonaHajm: 2, chegara: 'medium', zebra: true, sarlavhaFon: 'FFEEAA',
    shrift: { nom: 'Arial', olcham: 12 }, chekka: { chap: 1, ong: 1.2, yuqori: 0.7, past: 0.9 }, yonalish: 'portrait',
    daraja: { rs: { qalin: true, kursiv: false, olchamQosh: 0, matnRang: null, fon: null, otstup: 4 }, mat: { qalin: false, kursiv: false, olchamQosh: 2, matnRang: 'AA0000', fon: 'FFFF00', otstup: 3 } },
  });

  it('shrift, belgi ko‘rinishi, son formati, o‘ng-chap chekka, ramka va daraja uslubi bo‘yicha o‘zgaradi', () => {
    const b = namuna(maxsus);
    const o = dizaynOqi(b);
    expect(hujjatDizaynTekshir(b, maxsus)).toEqual([]);
    expect(o.varaqlar[0].ustunlar[katak(o, 'Тип').k.col].yashirin).toBe(false);
    expect(font(o, 'Бетон')).toMatchObject({ qalin: false, sz: 14, rang: 'AA0000' });
    expect(o.fonlar[katak(o, 'Бетон').xf.fillId]).toBe('FFFF00');
    expect(font(o, 'Затраты труда')).toMatchObject({ qalin: true, kursiv: false });
    expect(katak(o, 'Затраты труда').xf.indent).toBe(4);
    expect(o.numFmts.get(167)).toBe('#,##0');
    expect(o.numFmts.get(165)).toBe('#,##0.00####');
    expect(o.chegaralar[katak(o, 'Затраты труда').xf.borderId].l).toBe(true);
  });

  it('pul xonasi 0 bo‘lsa ustun enida o‘nlik joy ajratilmaydi', () => {
    const a = dizaynOqi(namuna(maxsus)).varaqlar[0].ustunlar[6].kenglik;
    const k = dizaynOqi(namuna(DIZAYN_PRESETLAR.kontrastli)).varaqlar[0].ustunlar[6].kenglik;
    expect(a).toBeLessThanOrEqual(k);
  });

  it('noto‘g‘ri saqlangan sozlama tozalanadi (hex, shrift, chegara) va sukutga qaytadi', () => {
    const t = dizaynTozala({ shrift: { nom: 'Comic', olcham: 99 }, chegara: 'zigzag', daraja: { bl: { fon: 'zzz', otstup: 99 } } });
    expect(t.shrift).toEqual({ nom: 'Times New Roman', olcham: 14 });
    expect(t.chegara).toBe('thin');
    expect(t.daraja.bl.fon).toBe('FFFFFF');
    expect(t.daraja.bl.otstup).toBe(6);
    expect(dizaynTozala(null).preset).toBe('kontrastli');
  });

  it('brauzerda saqlangan dizayn berilmagan generatorlarga ham qo‘llanadi', () => {
    hujjatDizayniniSaqla(maxsus);
    const o = dizaynOqi(namuna());
    expect(o.varaqlar[0].ustunlar[katak(o, 'Тип').k.col].yashirin).toBe(false);
    hujjatDizayniniSaqla(null);
    const p = dizaynOqi(namuna());
    expect(p.varaqlar[0].ustunlar[katak(p, 'Тип').k.col].yashirin).toBe(true);
  });

  it('zebra: BL guruhlari navbatlashib och fon bilan bo‘yaladi (RS/MAT/OB ham guruh bilan)', () => {
    const z = dizaynTozala({ ...DIZAYN_PRESETLAR.klassik, zebra: true, zebraFon: 'F0F0F0' });
    const o = dizaynOqi(namuna(z));
    const fonlari = o.varaqlar[0].qatorlar.flatMap((q) => q.kataklar.filter((k) => k.daraja === 'rs' && k.col === 2).map((k) => o.fonlar[o.xflar[k.s].fillId]));
    expect(fonlari).toEqual(['F0F0F0', null]);
  });

  it('presetlar: Minimal — ingichka (hair) ramka va fonsiz; Klassik — fonsiz', () => {
    expect(DIZAYN_PRESETLAR.minimal.chegara).toBe('hair');
    const o = dizaynOqi(namuna(DIZAYN_PRESETLAR.klassik));
    expect(o.fonlar[katak(o, 'Бетон').xf.fillId]).toBeNull();
    expect(uslubniOch(katak(o, 'Бетон').k.s).daraja).toBe('mat');
  });

  it('«Rangsiz» mavzu — hech qanday fon yo‘q (daraja foni ham), uslub (qalin/kursiv) saqlanadi', () => {
    const o = dizaynOqi(namuna(undefined, 'rangsiz'));
    expect(o.fonlar[katak(o, 'Бетон').xf.fillId]).toBeNull();
    expect(font(o, 'Бетон').qalin).toBe(true);
  });
});
