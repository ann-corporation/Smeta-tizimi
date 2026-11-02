import { describe, expect, it } from 'vitest';
import { bolimQqsBilan, kaskadCats, svodYaxlitQqs } from './svod-yaxlit';
import { katKesimServerdan, ustamaliHisobla } from './ustamali-summa';
import { nakrutkaKaskad } from './nakrutka-kaskad';
import { yaxlit2 } from './hisob-yadro';

// Sintetik (mijoz ma'lumoti emas). Egasi (2026-10-30): svodda yaxlit qator НДС dan KEYIN — summa QQS bilan va yakuniy.
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const CATS = { chel: 1000, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0 };
const bolim = (svod_summa: number | null, qqssiz: number) => ({ id: 1, qator_id: 10, nom: 'Б', svod_summa, qqs_stavka: svod_summa == null ? null : 12, qqssiz, barglar: qqssiz, asos: 'svod' as const, dalil: {} });

describe('svod yaxlit (QQS bilan, НДС dan keyin, aynan)', () => {
  it('yaxlit yo‘q — natija yo‘q (kaskad o‘zgarmaydi)', () => {
    expect(svodYaxlitQqs(null, 12)).toBeNull();
    expect(kaskadCats({ cats: CATS, cats_kaskad: { ...CATS, chel: 1 } })).toBe(CATS);
  });
  it('bo‘lim QQS bilan: svod summasi aynan; svodsiz — QQS siz × (1+QQS)', () => {
    expect(bolimQqsBilan(bolim(2240.01, 2000), 12)).toBe(2240.01);
    expect(bolimQqsBilan(bolim(null, 2000), 12)).toBe(2240);
    expect(bolimQqsBilan(bolim(null, 2000), null)).toBeNull();
  });
  it('ustamaliHisobla: ВСЕГО = ishlar ВСЕГО + svod summasi AYNAN; ustamali (QQS siz) = ishlar + svod QQS siz', () => {
    const yax = { qqssiz: 2000, barglar: 1000, summasiz: 0, bolimlar: [bolim(2240.01, 2000)] };
    const u = ustamaliHisobla(katKesimServerdan(CATS, yax), NK);
    const k = nakrutkaKaskad(CATS, NK);
    expect(u.ndsBilan).toBe(yaxlit2(k.vsego + 2240.01));
    expect(u.ustamali).toBe(yaxlit2(k.itogo4 + 2000));
    expect(u.ustamasiz).toBe(2000);
    const u0 = ustamaliHisobla(katKesimServerdan(CATS), NK);
    expect(u0.ustamali).toBe(k.itogo4);
  });
});
