import { describe, expect, it } from 'vitest';
import { aylantirishKoef, birlikLugat, kontragentAjrat, lugatKalit, lugatMosla, lugatSavol, nomzodYigish, oyrenishYozuvi, yorliqYasa, type LugatSinonim, type Nomzod } from './lugat';

// Faqat sintetik ma'lumot.
const n = (nomi: string, birligi: string | null, soni = 1, sana: string | null = null, narx: number | null = null): Nomzod => ({ nomi, birligi, manba: 'ombor', soni, oxirgi_sana: sana, oxirgi_narx: narx });

describe('lugatKalit: bitta narsaning turli yozilishi bir kalit', () => {
  it('beton markasi M200 = B15 (lotin/kirill, registr, tire)', () => {
    const k = lugatKalit('Beton M200');
    for (const x of ['beton М200', 'БЕТОН В15', 'beton b15', 'Beton M200 (B15)', 'beton M-200', 'бетон в-15']) expect(lugatKalit(x), x).toBe(k);
    expect(lugatKalit('beton M250')).not.toBe(k);
  });
  it('sinf (B) faqat beton kontekstida marka bo\'ladi — sementda emas', () => {
    expect(lugatKalit('sement M400')).not.toBe(lugatKalit('sement B30'));
  });
  it('sement/цемент va kirill-lotin aralash', () => {
    expect(lugatKalit('sement M400')).toBe(lugatKalit('Цемент М400'));
    expect(lugatKalit('tsement m400')).toBe(lugatKalit('sement М400'));
  });
  it('kontragent: huquqiy shakl shovqini tushadi', () => {
    expect(lugatKalit('Namuna Qurilish MChJ', 'kontragent')).toBe(lugatKalit('namuna qurilish', 'kontragent'));
    expect(lugatKalit('ООО «Намуна Курилиш»', 'kontragent')).toBe(lugatKalit('Namuna Kurilish', 'kontragent'));
  });
});

describe('birlik oilasi va aylantirish', () => {
  it('m3 = м3 = куб = kubometr', () => { for (const b of ['м3', 'куб', 'kubometr', 'm³', 'm^3']) expect(birlikLugat(b), b).toBe('m3'); });
  it('aylantirish faqat ma\'lum bo\'lganda', () => {
    expect(aylantirishKoef(['cement'], 'meshok', 'kg')).toBe(50);
    expect(aylantirishKoef(['beton'], 'meshok', 'kg')).toBeNull();
    expect(aylantirishKoef(['x'], 'tn', 'kg')).toBe(1000);
  });
});

describe('lugatMosla', () => {
  const baza = [n('Beton M200 (B15)', 'm3', 4, '2026-11-12', 650000), n('beton м200', 'м3', 2, '2026-10-01'), n('Beton M300', 'm3', 1), n('Armatura 12', 'kg', 3), n('Sement M400', 'qop', 5)];
  it('aniq (grade sinonimi + birlik oilasi) → avto; yozilishlar bitta nomzodga yig\'iladi', () => {
    const r = lugatMosla({ nomi: 'beton В15', birlik: 'куб' }, baza, []);
    expect(r.holat).toBe('avto');
    expect(r.tanlangan?.nomi).toBe('Beton M200 (B15)');
    expect(r.tanlangan?.soni).toBe(6);
    expect(r.tanlangan?.oxirgi_narx).toBe(650000);
    expect(r.tanlangan?.yorliq).toBe('Beton M200 (B15) — m3, oxirgi kirim 12.11');
    expect(nomzodYigish(baza, 'material').filter((x) => /beton/i.test(x.nomi)).length).toBe(2); // M200 va M300 — ko'paymagan
  });
  it('marka aytilmasa → tanlash (3–5 variant), yangi yaratilmaydi', () => {
    const r = lugatMosla({ nomi: 'beton', birlik: 'm3' }, baza, []);
    expect(r.holat).toBe('tanlash');
    expect(r.variantlar.map((x) => x.nomi)).toEqual(expect.arrayContaining(['Beton M200 (B15)', 'Beton M300']));
    expect(r.tanlangan).toBeNull();
  });
  it('boshqa marka avtomatik tanlanmaydi (raqam imzosi)', () => {
    const r = lugatMosla({ nomi: 'beton M250', birlik: 'm3' }, baza, []);
    expect(r.variantlar.some((x) => x.nomi === 'Beton M200 (B15)')).toBe(false);
    expect(r.holat).toBe('yangi');
  });
  it('imlo xatosi (typo) va qisman yozilish', () => {
    expect(lugatMosla({ nomi: 'armatrua 12', birlik: 'kg' }, baza, []).tanlangan?.nomi ?? lugatMosla({ nomi: 'armatrua 12', birlik: 'kg' }, baza, []).variantlar[0]?.nomi).toBe('Armatura 12');
    expect(lugatMosla({ nomi: 'sement', birlik: 'qop' }, baza, []).variantlar[0]?.nomi).toBe('Sement M400');
  });
  it('birlik farqi ballni tushiradi; ma\'lum aylantirishda aylantirish beriladi', () => {
    const r = lugatMosla({ nomi: 'sement M400', birlik: 'kg' }, [n('Sement M400', 'qop')], []);
    expect(r.tanlangan?.aylantirish).toEqual({ koef: 0.02, dan: 'kg', ga: 'qop' });
    const q = lugatMosla({ nomi: 'beton M200', birlik: 'kg' }, [n('Beton M200', 'm3')], []);
    expect(q.holat).not.toBe('avto');
  });
  it('kompaniya sinonimi darhol hal qiladi (hatto o\'xshashlik past bo\'lsa ham)', () => {
    const sin: LugatSinonim[] = [{ tur: 'material', ibora_kalit: lugatKalit('betonchik'), kanonik: 'Beton M200 (B15)', birlik: 'm3' }];
    const r = lugatMosla({ nomi: 'Betonchik' }, baza, sin);
    expect(r.holat).toBe('avto'); expect(r.sinonimdan).toBe(true); expect(r.tanlangan?.nomi).toBe('Beton M200 (B15)'); expect(r.tanlangan?.soni).toBe(6);
  });
  it('hech narsa mos kelmasa → yangi', () => { expect(lugatMosla({ nomi: 'lampa LED 9W', birlik: 'dona' }, baza, []).holat).toBe('yangi'); });
  it('kontragent: lotin/kirill va huquqiy shakl; bir nechta yaqin → tanlash', () => {
    const k = ['Hamkor Qurilish MChJ', 'Hamkor Servis', 'Ideal Metall'].map((x) => n(x, null, 1));
    const a = lugatMosla({ nomi: 'ХАМКОР курилиш' }, k, [], 'kontragent');
    expect(a.tanlangan?.nomi ?? a.variantlar[0].nomi).toBe('Hamkor Qurilish MChJ');
    const t = lugatMosla({ nomi: 'hamkor' }, k, [], 'kontragent');
    expect(t.holat).toBe('tanlash'); expect(t.variantlar.length).toBeGreaterThanOrEqual(2);
  });
});

describe('kontragentAjrat: ko\'p so\'zli yetkazuvchi', () => {
  const k = ['Hamkor Qurilish MChJ', 'Ideal Metall'].map((x) => n(x, null));
  it('lug\'at bo\'yicha: nom oxiridagi so\'z yetkazuvchiga qaytariladi', () => {
    expect(kontragentAjrat('beton В15 Hamkor', 'Qurilish', k, [])).toEqual({ nomi: 'beton В15', kontragent: 'Hamkor Qurilish', sabab: 'lugat' });
  });
  it('lug\'atda yo\'q: faqat aniq chegara (raqam/kichik harf) bo\'lsa va bosh harfli', () => {
    expect(kontragentAjrat('Beton M200 Namuna', 'Savdo', [], [])).toMatchObject({ nomi: 'Beton M200', kontragent: 'Namuna Savdo', sabab: 'bosh_harf' });
    expect(kontragentAjrat('Beton Armatura', 'Savdo', [], []).sabab).toBeNull(); // chegara yo'q — tegilmaydi
    expect(kontragentAjrat('Armatura', 'Akmal', k, []).sabab).toBeNull();
    expect(kontragentAjrat('beton M200', 'Qurilish', k, []).sabab).toBeNull(); // «Qurilish» o'zi — M200 yetkazuvchi so'zi emas
  });
});

describe('lugatSavol va oyrenishYozuvi', () => {
  it('tugmalar: mavjud variantlar + «Yangi» (yangi: true)', () => {
    const r = lugatMosla({ nomi: 'beton', birlik: 'm3' }, [n('Beton M200', 'm3', 2, '2026-11-12'), n('Beton M300', 'm3')], []);
    const s = lugatSavol('material', 'beton', r);
    expect(s.variantlar.length).toBe(3); expect(s.variantlar[0].tanlov).toMatchObject({ nomi: expect.any(String), ibora: 'beton' });
    expect(s.variantlar.at(-1)).toEqual({ yorliq: 'Yangi: «beton»', tanlov: { nomi: 'beton', yangi: true, ibora: 'beton' } });
    expect(s.yangi_element).toBe(false);
  });
  it('o\'rganish: normallashtirish o\'zi hal qilgan ibora saqlanmaydi (lug\'at to\'lmasin)', () => {
    expect(oyrenishYozuvi('material', 'beton b15', 'Beton M200 (B15)')).toBeNull();
    const y = oyrenishYozuvi('material', 'betonchik', 'Beton M200 (B15)', 'm3');
    expect(y).toMatchObject({ ibora: 'betonchik', kanonik: 'Beton M200 (B15)', birlik: 'm3' });
    expect(y?.ibora_kalit).toBe(lugatKalit('betonchik'));
    expect(oyrenishYozuvi('kontragent', '', 'X')).toBeNull();
  });
  it('yorliqYasa: sana bo\'lmasa manba', () => { expect(yorliqYasa({ nomi: 'X', birligi: 'kg', oxirgi_sana: null, manba: 'katalog' })).toBe('X — kg, katalogdan'); });
});
