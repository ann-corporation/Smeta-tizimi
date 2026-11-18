import { describe, expect, it } from 'vitest';
import { buyruqTekshir, llmJsonOl, oddiyTahlil, tokenTekshir, tokenYarat } from './ombor-buyruq-yadro';

// Faqat sintetik jumlalar.
const HOZIR = new Date('2026-11-17T08:00:00Z');
const t = (s: string) => oddiyTahlil(s, HOZIR);

describe('oddiyTahlil (o\'zbek / rus, sintetik)', () => {
  it('kirim: o\'zbekcha', () => {
    const r = t('50 kg mix keldi');
    expect(r.ishonch).toBe('yuqori');
    expect(r.buyruq).toMatchObject({ amal: 'prixod', miqdor: 50, birlik: 'кг', nomi: 'mix' });
  });
  it('kirim: ruscha, o\'nli vergul', () => {
    const r = t('Приход цемент 10,5 тонн от Тест-Снаб');
    expect(r.buyruq).toMatchObject({ amal: 'prixod', miqdor: 10.5, birlik: 'тн' });
    expect(r.buyruq?.nomi).toContain('цемент');
    expect(r.buyruq?.kontragent).toBe('Тест-Снаб');
  });
  it('chiqim: kimga berilgani', () => {
    const r = t('qum 9 m3 prorab Aliga berdim');
    expect(r.buyruq?.amal).toBe('chiqim');
    expect(r.buyruq).toMatchObject({ miqdor: 9, birlik: 'м3' });
  });
  it('ostatka so\'rovi', () => {
    const r = t('сколько осталось песка');
    expect(r.buyruq?.amal).toBe('qoldiq');
    expect(r.ishonch).toBe('yuqori');
    expect(t('sement qoldig\'i qancha').buyruq?.amal).toBe('qoldiq');
  });
  it('tuzatish aniq yozuvga havola qiladi, havolasiz past ishonch', () => {
    const a = t('#123 ni 50 ga o\'zgartir');
    expect(a.buyruq).toMatchObject({ amal: 'tuzat', harakat_id: 123, miqdor: 50, yangi: { miqdor: 50 } });
    expect(a.ishonch).toBe('yuqori');
    expect(t('oxirgi kirimni tuzat 50').ishonch).toBe('past');
  });
  it('bekor: harakat raqami bilan', () => {
    expect(t('bekor qil №77').buyruq).toMatchObject({ amal: 'bekor', harakat_id: 77 });
    expect(t('bekor qil').ishonch).toBe('past');
  });
  it('sana: kecha / ISO', () => {
    expect(t('kecha 20 dona kabel keldi').buyruq?.sana).toBe('2026-11-16');
    expect(t('2026-11-01 20 dona kabel keldi').buyruq?.sana).toBe('2026-11-01');
  });
  it('tushunarsiz yoki yetarli emas — past ishonch (LLM ga o\'tadi)', () => {
    expect(t('salom qalaysan').buyruq).toBeNull();
    expect(t('keldi').ishonch).toBe('past');
    expect(t('o\'n besh qop sement keldi').ishonch).toBe('past'); // raqam so'zi — LLM ishi
  });
});

describe('buyruqTekshir (LLM chiqishi)', () => {
  it('yaroqli JSON ni qat\'iy shaklga keltiradi', () => {
    const b = buyruqTekshir(llmJsonOl('```json\n{"amal":"chiqim","nomi":"Тест труба ф25","miqdor":"12,5","birlik":"м","kontragent":"Brigada 1","sana":"2026-11-10","harakat_id":null}\n```'));
    expect(b).toMatchObject({ amal: 'chiqim', miqdor: 12.5, birlik: 'м', sana: '2026-11-10', harakat_id: null });
  });
  it('noto\'g\'ri amal, manfiy miqdor, yomon sana rad / tozalanadi', () => {
    expect(buyruqTekshir({ amal: 'delete_all' })).toBeNull();
    expect(buyruqTekshir({ amal: 'prixod', miqdor: -5, sana: '2026-13-45', nomi: 'x' })).toMatchObject({ miqdor: null, sana: null });
    expect(buyruqTekshir('prixod')).toBeNull();
    expect(llmJsonOl('bu JSON emas')).toBeNull();
  });
});

describe('tasdiq tokeni', () => {
  const sir = 's'.repeat(32);
  const yuk = { a: 7, k: 1, s: 9, op: '00000000-0000-4000-8000-000000000001', p: { tur: 'prixod', nomi: 'Тест', miqdor: 5 } };
  it('aylanib o\'tadi', async () => {
    const tok = await tokenYarat(sir, yuk);
    expect(await tokenTekshir(sir, tok)).toMatchObject({ a: 7, k: 1, s: 9, op: yuk.op });
  });
  it('o\'zgartirilgan yuk, boshqa sir, muddati o\'tgan token yaroqsiz', async () => {
    const tok = await tokenYarat(sir, yuk, 60_000, 1_000_000);
    const [tana, imzo] = tok.split('.');
    const bytes = new TextEncoder().encode(JSON.stringify({ ...yuk, a: 8, e: 9e15 }));
    let bin = ''; for (const x of bytes) bin += String.fromCharCode(x);
    const soxta = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await tokenTekshir(sir, soxta + '.' + imzo, 1_000_001)).toBeNull();
    expect(await tokenTekshir('x'.repeat(32), tok, 1_000_001)).toBeNull();
    expect(await tokenTekshir(sir, tana + '.' + imzo, 1_000_000 + 61_000)).toBe('muddati');
    expect(await tokenTekshir(sir, 'axlat')).toBeNull();
  });
});
