import { describe, expect, it } from 'vitest';
import { aosrSinovMatni, maydonXatosi, maydonYuki, natijaMaslahati } from './sinov-maslahat';

describe('natijaMaslahati', () => {
  it('beton: o‘lchangan talabdan past — mos emas, teng yoki yuqori — mos', () => {
    expect(natijaMaslahati('beton_kub', { olchangan_mpa: '20', talab_mpa: '25' })?.natija).toBe('mos_emas');
    expect(natijaMaslahati('beton_kub', { olchangan_mpa: '25', talab_mpa: '25' })?.natija).toBe('mos');
    expect(natijaMaslahati('beton_kub', { olchangan_mpa: '30,5', talab_mpa: 25 })?.natija).toBe('mos');
  });
  it('noma‘lum qiymat — maslahat yo‘q (mos deb taxmin qilinmaydi)', () => {
    expect(natijaMaslahati('beton_kub', { olchangan_mpa: '', talab_mpa: '25' })).toBeNull();
    expect(natijaMaslahati('payvand', { baho: 'yaxshi' })).toBeNull();
  });
  it('gidravlik: bosim pasayishi ruxsatdan oshmasin', () => {
    expect(natijaMaslahati('gidravlik', { bosim_pasayishi_mpa: '0.05', ruxsat_pasayish_mpa: '0.02' })?.natija).toBe('mos_emas');
    expect(natijaMaslahati('gidravlik', { bosim_pasayishi_mpa: '0.01', ruxsat_pasayish_mpa: '0.02' })?.natija).toBe('mos');
  });
});

describe('maydonlar', () => {
  const m = [
    { kalit: 'marka_sinf', nom: 'Marka', tur: 'matn' as const, majburiy: true },
    { kalit: 'olchangan_mpa', nom: 'MPa', tur: 'son' as const, majburiy: true },
    { kalit: 'asbob', nom: 'Asbob', tur: 'matn' as const },
  ];
  it('majburiy va son tekshiruvi', () => {
    expect(maydonXatosi(m, { marka_sinf: 'B25' })).toMatch(/MPa/);
    expect(maydonXatosi(m, { marka_sinf: 'B25', olchangan_mpa: 'abc' })).toMatch(/Son/);
    expect(maydonXatosi(m, { marka_sinf: 'B25', olchangan_mpa: '27,5' })).toBeNull();
  });
  it('yuk: bo‘sh tashlanadi, son songa aylanadi', () => {
    expect(maydonYuki(m, { marka_sinf: ' B25 ', olchangan_mpa: '27,5', asbob: '' })).toEqual({ marka_sinf: 'B25', olchangan_mpa: 27.5 });
  });
});

describe('aosrSinovMatni', () => {
  it('bloklangan, kutilmoqda va toza holat', () => {
    expect(aosrSinovMatni({ bloklangan: true, holat: { nomos: [{ nom: 'Beton' }], kutilmoqda: [] } })).toMatch(/mos emas: Beton/);
    expect(aosrSinovMatni({ bloklangan: false, holat: { nomos: [], kutilmoqda: [{ nom: 'Grunt' }] } })).toMatch(/kutilmoqda: Grunt/);
    expect(aosrSinovMatni({ bloklangan: false, holat: { nomos: [], kutilmoqda: [] } })).toBeNull();
    expect(aosrSinovMatni(undefined)).toBeNull();
  });
});
