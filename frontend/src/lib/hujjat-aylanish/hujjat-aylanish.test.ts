import { describe, expect, it } from 'vitest';
import { hujjatTekshir } from '../hujjat-yozuvchi';
import { navbatdagiQadam, qarorQollash, qaytaYuborish, egasiAmallari, menQarorChiqaraman, type ZanjirModel } from './zanjir';
import { shablonToliqligi, SHABLON_TURLARI, type ShablonKirish } from './toliqlik';
import { shablonYoz } from './shablon';

// Sintetik ma'lumot: haqiqiy nom, summa yoki INN yo'q.
const zanjir = (): ZanjirModel => ({
  holat: 'jarayonda', meniki: false,
  qadamlar: [{ tartib: 1, holat: 'navbat', men: true }, { tartib: 2, holat: 'kutilmoqda', men: false }],
});

describe('tasdiq zanjiri holat mashinasi', () => {
  it('tasdiqlash navbatni keyingi qadamga o‘tkazadi, oxirgisida yakunlaydi', () => {
    const a = qarorQollash(zanjir(), 'tasdiqlash');
    expect(a.ok && a.zanjir.holat).toBe('jarayonda');
    expect(a.ok && a.zanjir.qadamlar.map((q) => q.holat)).toEqual(['tasdiqlandi', 'navbat']);
    const z2: ZanjirModel = a.ok ? { ...a.zanjir, qadamlar: a.zanjir.qadamlar.map((q) => ({ ...q, men: true })) } : zanjir();
    const b = qarorQollash(z2, 'tasdiqlash');
    expect(b.ok && b.zanjir.holat).toBe('tasdiqlandi');
    expect(navbatdagiQadam(b.ok ? b.zanjir : zanjir())).toBeNull();
  });
  it('rad va qaytarishda izoh majburiy; rad yakuniy, qaytarish qayta yuborishga olib keladi', () => {
    expect(qarorQollash(zanjir(), 'rad', ' ')).toEqual({ ok: false, code: 'IZOH_KERAK' });
    expect(qarorQollash(zanjir(), 'qaytarish', 'xx')).toEqual({ ok: false, code: 'IZOH_KERAK' });
    const rad = qarorQollash(zanjir(), 'rad', 'Mos emas');
    expect(rad.ok && rad.zanjir.holat).toBe('rad');
    const q = qarorQollash(zanjir(), 'qaytarish', 'Sana yo‘q');
    expect(q.ok && q.zanjir.holat).toBe('qaytarildi');
    const qayta = qaytaYuborish(q.ok ? { ...q.zanjir, meniki: true } : zanjir());
    expect(qayta?.holat).toBe('jarayonda');
    expect(qayta?.qadamlar.map((x) => x.holat)).toEqual(['navbat', 'kutilmoqda']);
  });
  it('navbatsiz kishi qaror chiqara olmaydi; yakuniy zanjir qayta ochilmaydi', () => {
    const z = zanjir();
    expect(menQarorChiqaraman({ ...z, qadamlar: [{ ...z.qadamlar[0], men: false }, z.qadamlar[1]] })).toBe(false);
    expect(qarorQollash({ ...z, holat: 'tasdiqlandi' }, 'tasdiqlash')).toEqual({ ok: false, code: 'NAVBAT_EMAS' });
    expect(qaytaYuborish({ ...z, holat: 'rad' })).toBeNull();
    expect(egasiAmallari({ ...z, meniki: true, holat: 'qaytarildi' })).toEqual({ qayta: true, bekor: true });
    expect(egasiAmallari({ ...z, meniki: true, holat: 'tasdiqlandi' })).toEqual({ qayta: false, bekor: false });
  });
});

const TOLIQ: Record<string, ShablonKirish> = {
  lab_protokol: { raqam: '1', sana: '2026-11-04', obyekt: 'Объект А', laboratoriya: 'Лаборатория А', sinovTuri: 'Прочность бетона', normativ: 'ГОСТ 10180', xulosa: 'Соответствует',
    korsatkichlar: [{ nom: 'Прочность на сжатие', birlik: 'МПа', talab: '≥ 25', natija: '27,4', xulosa: 'соотв.' }] },
  akt_osvidetelstvovaniya: { raqam: '2', sana: '2026-11-04', obyekt: 'Объект А', ishNomi: 'Армирование фундамента', loyiha: 'Шифр 01-КЖ', ishTavsifi: 'Армирование выполнено', xulosa: 'Разрешается бетонирование' },
  predpisaniya: { raqam: '3', sana: '2026-11-04', obyekt: 'Объект А', pudratchi: 'Подрядчик А', muddat: '2026-11-10', normativ: 'ШНК 3.03.01', nuqsonlar: [{ matn: 'Защитный слой меньше проектного', joy: 'ось 1–3' }] },
  soprovod_xat: { raqam: '4', sana: '2026-11-04', qabulQiluvchi: 'Заказчик А', mavzu: 'Передача исполнительной документации', ilovalar: [{ nom: 'АОСР № 1', varaqlar: 3 }] },
};

describe('shablon to‘liqligi', () => {
  it('to‘liq kirishda yetishmagan maydon yo‘q', () => {
    for (const tur of SHABLON_TURLARI) expect(shablonToliqligi(tur, TOLIQ[tur]), tur).toEqual([]);
  });
  it('bo‘sh kirishda majburiy maydonlar sanaladi, o‘ylab topilmaydi', () => {
    for (const tur of SHABLON_TURLARI) expect(shablonToliqligi(tur, {}).length, tur).toBeGreaterThanOrEqual(4);
  });
  it('predpisaniyada muddat har nuqsonda bo‘lsa umumiy muddat shart emas', () => {
    const k: ShablonKirish = { ...TOLIQ.predpisaniya, muddat: null, nuqsonlar: [{ matn: 'A', muddat: '2026-11-10' }] };
    expect(shablonToliqligi('predpisaniya', k).map((y) => y.nom)).not.toContain('Срок устранения');
    expect(shablonToliqligi('predpisaniya', { ...k, nuqsonlar: [{ matn: 'A' }] }).map((y) => y.nom)).toContain('Срок устранения');
  });
});

describe('shablon hujjatlari (hujjat-yozuvchi standarti)', () => {
  for (const tur of SHABLON_TURLARI) {
    it(`${tur}: A4, texnik matn yo'q, imzo bloki bor`, () => {
      const kirish = { ...TOLIQ[tur], nuqsonlar: tur === 'predpisaniya' ? [{ matn: 'Защитный слой меньше проектного', joy: 'ось 1–3' }] : undefined };
      const r = shablonYoz(tur, kirish);
      expect(r.yetishmaydi).toBe(0);
      expect(r.faylNomi.endsWith('.xlsx')).toBe(true);
      const t = hujjatTekshir(r.bytes);
      expect(t.taqiqlangan).toEqual([]);
      expect(t.dollarFormulalar).toEqual([]);
      expect(t.varaqlar.every((v) => v.a4 && v.bittaEnli && v.printArea)).toBe(true);
      expect(t.matnlar.some((x) => x.includes('подпись'))).toBe(true);
    });
  }
  it('yetishmagan maydonlar hujjatda «ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ» sifatida chiqadi', () => {
    const r = shablonYoz('lab_protokol', { obyekt: 'Объект А' });
    expect(r.yetishmaydi).toBeGreaterThan(0);
    expect(hujjatTekshir(r.bytes).matnlar.some((x) => x.includes('ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ'))).toBe(true);
  });
});
