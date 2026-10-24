import { describe, expect, it } from 'vitest';
import { NAKRUTKA_STANDART } from '../nakrutka-kaskad';
import {
  foydalanishniTekshir, joriyRevizya, revizyaKorinishlari, revizyaXulosa, ruxsatBerishXatosi, varaqKaliti,
  type ChizmaVaraq,
} from './chizma-revizya';
import { hajmFarqi, loyihaOzgarishTaasiri, type LoyihaOzgarishQatori } from './loyiha-ozgarish-taasir';

// Sintetik ma'lumot (haqiqiy mijoz ma'lumoti emas).
const v = (id: string, revizya: number, holat: ChizmaVaraq['holat'], ozgarishIzohi?: string, varaq = '12', marka = 'КЖ'): ChizmaVaraq =>
  ({ id, marka, bosqich: 'RD', varaq, revizya, holat, ozgarishIzohi });

describe('chizma revizyasi: joriy / eskirgan / ruxsatsiz', () => {
  const set = [v('a0', 0, 'ruxsat'), v('a1', 1, 'ruxsat', 'Armatura 14 -> 16'), v('a2', 2, 'qoralama', 'Ustun kesimi'), v('x', 0, 'bekor'), v('b0', 0, 'ruxsat', undefined, '13')];

  it('eng yuqori ruxsatli revizya joriy; pastlari eskirgan; qoralama ruxsatsiz', () => {
    const k = revizyaKorinishlari(set);
    expect(k.get('a1')).toBe('joriy');
    expect(k.get('a0')).toBe('eskirgan');
    expect(k.get('a2')).toBe('ruxsatsiz');
    expect(k.get('x')).toBe('bekor');
    expect(k.get('b0')).toBe('joriy'); // boshqa varaq alohida hisoblanadi
    expect(revizyaXulosa(set)).toEqual({ joriy: 2, eskirgan: 1, ruxsatsiz: 1, bekor: 1 });
  });

  it('marka registri va probel farqi bir varaq hisoblanadi', () => {
    expect(varaqKaliti({ marka: 'кж', bosqich: 'RD', varaq: ' 12 ' })).toBe(varaqKaliti({ marka: 'КЖ', bosqich: 'RD', varaq: '12' }));
  });

  it('joriyRevizya: ruxsat yo\'q bo\'lsa null', () => {
    expect(joriyRevizya([v('q', 0, 'qoralama')], varaqKaliti(v('q', 0, 'qoralama')))).toBeNull();
    expect(joriyRevizya(set, varaqKaliti(set[0]))?.id).toBe('a1');
  });

  it('foydalanish: eskirgan revizya ogohlantiriladi, joriy toza', () => {
    const ref = { marka: 'КЖ', bosqich: 'RD' as const, varaq: '12' };
    expect(foydalanishniTekshir(set, ref, 1)).toEqual({ holat: 'joriy' });
    expect(foydalanishniTekshir(set, ref, 0)).toEqual({ holat: 'eskirgan', joriyRevizya: 1 });
    expect(foydalanishniTekshir(set, ref, 2)).toEqual({ holat: 'ruxsatsiz' });
    expect(foydalanishniTekshir(set, { ...ref, varaq: '99' }, 0)).toEqual({ holat: 'topilmadi' });
  });

  it('ruxsat shtampi: izohsiz revizya, eski revizya, bekor va allaqachon ruxsatli rad etiladi', () => {
    const s = [v('r0', 0, 'ruxsat'), v('r1', 1, 'qoralama'), v('r2', 2, 'ruxsat', 'x'), v('r3', 3, 'qoralama', 'Yangi'), v('r4', 4, 'bekor', 'z')];
    expect(ruxsatBerishXatosi(s, 'r1')).toBe('IZOH_KERAK');
    expect(ruxsatBerishXatosi(s, 'r0')).toBe('ALLAQACHON_RUXSAT');
    expect(ruxsatBerishXatosi(s, 'r4')).toBe('BEKOR');
    expect(ruxsatBerishXatosi([v('e1', 1, 'qoralama', 'ok'), v('e2', 2, 'ruxsat', 'ok')], 'e1')).toBe('ESKIRGAN_REVIZYA');
    expect(ruxsatBerishXatosi(s, 'r3')).toBeNull();
    expect(ruxsatBerishXatosi([v('n0', 0, 'qoralama')], 'n0')).toBeNull(); // 0-revizyada izoh shart emas
  });
});

describe('loyiha o\'zgarishi -> smeta ta\'siri (alohida qatlam)', () => {
  const qosh: LoyihaOzgarishQatori = { qatorId: null, amal: 'qoshish', nom: 'Yangi ish', kat: 'МАТ', yangiHajm: 10, narx: 100 };
  const ol: LoyihaOzgarishQatori = { qatorId: 5, amal: 'olib_tashlash', nom: 'Eski ish', kat: 'МАТ', eskiHajm: 4, narx: 100 };

  it('hajm farqi imzoli', () => {
    expect(hajmFarqi(qosh)).toBe(10);
    expect(hajmFarqi(ol)).toBe(-4);
    expect(hajmFarqi({ qatorId: 1, amal: 'hajm', nom: 'h', kat: null, eskiHajm: 8, yangiHajm: 5, narx: 1 })).toBe(-3);
  });

  it('ustamasiz va ustamali alohida; sof = qoshilgan - olingan', () => {
    const t = loyihaOzgarishTaasiri([qosh, ol], NAKRUTKA_STANDART);
    expect(t.qoshilgan.ustamasiz).toBe(1000);
    expect(t.olingan.ustamasiz).toBe(400);
    expect(t.sof.ustamasiz).toBe(600);
    expect(t.sof.ustamali).not.toBeNull();
    expect(t.sof.ustamali!).toBeGreaterThan(t.sof.ustamasiz); // nakrutka bilan ko'proq
    expect(t.narxsizSoni).toBe(0);
  });

  it('narxsiz qator 0 emas: summaga kirmaydi, soni hisoblanadi', () => {
    const t = loyihaOzgarishTaasiri([qosh, { ...ol, narx: null }], NAKRUTKA_STANDART);
    expect(t.narxsizSoni).toBe(1);
    expect(t.qatorlar[1].summaFarqi).toBeNull();
    expect(t.sof.ustamasiz).toBe(1000);
  });

  it('kategoriyasi noma\'lum summa ustamaga aylanmaydi; koeffitsient yo\'q - ustamali null', () => {
    const t = loyihaOzgarishTaasiri([{ ...qosh, kat: null }], NAKRUTKA_STANDART);
    expect(t.qoshilgan.nomalum.summa).toBe(1000);
    expect(t.qoshilgan.ustamasiz).toBe(0);
    const k = loyihaOzgarishTaasiri([qosh], null);
    expect(k.sof.ustamali).toBeNull();
    expect(k.sof.ustamasiz).toBe(1000);
  });

  it('kirish qatorlari o\'zgartirilmaydi (asl smeta qatlami const)', () => {
    const kirish = [Object.freeze({ ...qosh }), Object.freeze({ ...ol })];
    expect(() => loyihaOzgarishTaasiri(kirish, NAKRUTKA_STANDART)).not.toThrow();
  });
});
