import { describe, it, expect } from 'vitest';
import { sahifaVaAmalQidir, yozuvQidir, qidiruvMosmi } from './qidiruv';

const bandlar = [
  { yol: '/admin/shartnoma-liniya', nom: 'Shartnomalar va tomonlar', guruh: 'Moliya' },
  { yol: '/admin/fakt', nom: 'Fakt kiritish', guruh: 'Obyekt' },
  { yol: '/admin/f2-tayyorlash', nom: 'F2 tayyorlash', guruh: 'Obyekt' },
  { yol: '/admin/documents', nom: 'Hujjatlar', guruh: 'Hujjatlar' },
];

describe('universal qidiruv', () => {
  it('sahifa nom/sinonim bo‘yicha (uz/ru), lotin va kirill farqsiz', () => {
    expect(sahifaVaAmalQidir('fakt', bandlar).some((n) => n.yol === '/admin/fakt' && n.tur === 'sahifa')).toBe(true);
    expect(sahifaVaAmalQidir('договор', bandlar).some((n) => n.yol === '/admin/shartnoma-liniya')).toBe(true);
    expect(sahifaVaAmalQidir('shartnoma', bandlar).some((n) => n.yol === '/admin/shartnoma-liniya')).toBe(true);
  });
  it('amal topiladi va amal yo‘liga olib boradi', () => {
    const n = sahifaVaAmalQidir('yangi shartnoma', bandlar).find((x) => x.tur === 'amal');
    expect(n?.yol).toBe('/admin/shartnoma-liniya');
    expect(sahifaVaAmalQidir('f2 yaratish', bandlar).find((x) => x.tur === 'amal')?.yol).toBe('/admin/f2-tayyorlash');
  });
  it('ko‘rinmaydigan sahifaning amali chiqmaydi; ruxsatsiz capability ham', () => {
    expect(sahifaVaAmalQidir('yangi obyekt', bandlar).some((x) => x.tur === 'amal')).toBe(false);
    expect(sahifaVaAmalQidir('yangi shartnoma', bandlar, ['smeta.read']).some((x) => x.tur === 'amal')).toBe(false);
    expect(sahifaVaAmalQidir('yangi shartnoma', bandlar, ['financial.write']).some((x) => x.tur === 'amal')).toBe(true);
  });
  it('bo‘sh so‘rov: faqat sahifalar, tartib saqlanadi', () => {
    const r = sahifaVaAmalQidir('', bandlar);
    expect(r.map((x) => x.yol)).toEqual(bandlar.map((b) => b.yol));
  });
  it('yozuv qidiruvi: lotin nom kirill so‘rovga, raqam bo‘yicha', () => {
    const obyektlar = [{ nom: 'Amfiteatr' }, { nom: 'Fontan' }];
    expect(yozuvQidir(obyektlar, 'Амфитеатр', (o) => o.nom, 5)).toEqual([{ nom: 'Amfiteatr' }]);
    expect(yozuvQidir(obyektlar, 'amfi', (o) => o.nom, 5)).toEqual([{ nom: 'Amfiteatr' }]);
    const sh = [{ raqam: '12/2026', nom: 'Beton' }, { raqam: '7', nom: 'Pol' }];
    expect(yozuvQidir(sh, '12/2026', (x) => `${x.raqam} ${x.nom}`, 5)).toHaveLength(1);
    expect(yozuvQidir(sh, 'бетон', (x) => `${x.raqam} ${x.nom}`, 5)).toHaveLength(1);
    expect(qidiruvMosmi('Shartnoma', 'ШАРТНОМА')).toBe(true);
  });
});