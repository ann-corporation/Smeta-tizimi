import { describe, expect, it } from 'vitest';
import { jsonAjrat, manbaMaterialiniTekshir, suhbatJavobiniTekshir } from './protokol';

const JAVOB = { javob: 'Tushunarli. Fundament o‘lchamlarini ayting.', savollar: ['Uzunligi qancha?'], ishlar: [{ id: 'w1', bolim: 'Fundament', tavsif: 'Beton tayyorlov B7,5', qidiruv: ['Устройство бетонной подготовки'], birlik: 'м3', hajmIfoda: null, hajmIzoh: null, material: 'Бетон B7,5', holat: 'HAJM_KERAK' }] };

it('blocks a conditional quantity and an invented concrete class from the live owner example', () => {
  const parsed = suhbatJavobiniTekshir({ ...JAVOB, ishlar: [{ ...JAVOB.ishlar[0], hajmIfoda: '48*0.6*0.1', hajmIzoh: 'agar kengligi fundament bilan bir xil bo‘lsa', holat: 'TAYYOR' }] });
  expect(parsed.ishlar[0].holat).toBe('ANIQLASH_KERAK');
  const grounded = manbaMaterialiniTekshir(parsed, 'Beton B20; podbetonka 10 sm; 1.2 tonna A3; 0.6 tonna A1');
  expect(grounded.ishlar[0].material).toBeNull();
  expect(grounded.savollar.join(' ')).toContain('ko‘rsatilmagan');
  expect(manbaMaterialiniTekshir(suhbatJavobiniTekshir(JAVOB), 'Beton В7.5').ishlar[0].material).toBe('Бетон B7,5');
});

describe('jsonAjrat — har qanday model javobi shakli', () => {
  it('toza JSON', () => expect(jsonAjrat(JSON.stringify(JAVOB))).toEqual(JAVOB));
  it('```json bloki va oldin/keyin izoh', () => {
    expect(jsonAjrat(`Mana javob:\n\`\`\`json\n${JSON.stringify(JAVOB)}\n\`\`\`\nUmid qilaman foydali.`, ['javob'])).toEqual(JAVOB);
  });
  it('<think> o‘ylash matni ichida {qavslar} bo‘lsa ham', () => {
    expect(jsonAjrat(`<think>Avval {hajm} ni topaman, keyin {narx}...</think>\n${JSON.stringify(JAVOB)}`, ['javob'])).toEqual(JAVOB);
  });
  it('matn ichida qavsli izoh + bir nechta obyekt — kerakli kalitlisi olinadi', () => {
    const t = `Misol: {"a":1}. Qoida {x}. Yakuniy: ${JSON.stringify(JAVOB)}`;
    expect(jsonAjrat(t, ['javob', 'ishlar'])).toEqual(JAVOB);
  });
  it('satr ichidagi } va \\" buzmaydi', () => {
    const o = { javob: 'Belgi } va "qo‘shtirnoq"', savollar: [], ishlar: [] };
    expect(jsonAjrat(`izoh ${JSON.stringify(o)}`, ['javob'])).toEqual(o);
  });
  it('JSON umuman yo‘q — null', () => expect(jsonAjrat('Kechirasiz, tushunmadim.')).toBeNull());
});

describe('suhbatJavobiniTekshir — model farqlariga chidamli', () => {
  it('ishsiz javob (faqat savol) — xato emas, javob va savollar qaytadi', () => {
    const r = suhbatJavobiniTekshir({ javob: 'Qanday ish bajarildi?', savollar: ['Hajmi?'] });
    expect(r).toMatchObject({ javob: 'Qanday ish bajarildi?', savollar: ['Hajmi?'], ishlar: [] });
  });
  it('id yo‘q, qidiruv yo‘q, birlik "100 м3" — ish saqlanadi', () => {
    const r = suhbatJavobiniTekshir({ javob: 'ok', ishlar: [{ tavsif: 'Устройство бетонной подготовки', birlik: '100 м3' }, { nom: 'Армирование', unit: 'т', id: 'w1' }] });
    expect(r.ishlar.map((i) => [i.birlik, i.qidiruv[0]])).toEqual([['м3', 'Устройство бетонной подготовки'], ['т', 'Армирование']]);
    expect(new Set(r.ishlar.map((i) => i.id)).size).toBe(2);
  });
});
