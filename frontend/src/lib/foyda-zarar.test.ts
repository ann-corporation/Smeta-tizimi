import { describe, expect, it } from 'vitest';
import type { SummaPaket } from './summa-paket';
import { foydaZararDaraxti, type FzObyekt } from './foyda-zarar';

const paket = (ustamali: number, kesim: Partial<SummaPaket['kesim']> = {}): SummaPaket => ({
  qqs_bilan: ustamali * 1.5, qqs: 0, ustamali, ustamasiz: ustamali / 2, qqs_foiz: 12, ustamasiz_qism: 0,
  kesim: { chel: 0, mash: 0, mat: ustamali / 2, ob: 0, subpudrat: 0, svod: 0, ustamasiz: 0, nomalum: 0, ...kesim },
  soat: { chel: 0, mash: 0, mashinist: 0 }, subpudratchilar: [], narxsiz_soni: 0, qator_soni: 1,
});
const ob = (id: number, loyiha: number | null, sh: number | null, f2: SummaPaket | null): FzObyekt => ({
  obyekt_id: id, nom: 'O' + id, loyiha_id: loyiha, loyiha_nom: loyiha ? 'L' + loyiha : null, shartnoma: sh ? { id: sh, raqam: 'S' + sh } : null, f2,
});

describe('foydaZararDaraxti', () => {
  it('xarajat yo‘q — foyda null (soxta plyus yo‘q), sabab va to‘liqlik aytadi', () => {
    const { root } = foydaZararDaraxti({ kompaniyaNom: 'K', obyektlar: [ob(1, 1, 1, paket(1000))], xarajat: [], tolov: [] });
    expect(root.foyda).toBeNull(); expect(root.turi).toBe('nomalum');
    expect(root.toliqlik).toContain('xarajat'); expect(root.bajarilgan?.ustamali).toBe(1000);
  });
  it('tasdiqlangan F2 yo‘q — bajarilgan null, 0 emas', () => {
    const { root } = foydaZararDaraxti({ kompaniyaNom: 'K', obyektlar: [ob(1, 1, null, null)], xarajat: [{ obyekt_id: 1, shartnoma_id: null, kat: 'МАТ', summa: 5 }], tolov: [] });
    expect(root.bajarilgan).toBeNull(); expect(root.foyda).toBeNull(); expect(root.toliqlik).toContain('f2');
  });
  it('plyus / minus, kategoriya farqi va sabab (material smetadan ko‘p)', () => {
    const { root } = foydaZararDaraxti({
      kompaniyaNom: 'K', obyektlar: [ob(1, 1, 1, paket(1000, { mat: 400, chel: 100 }))],
      xarajat: [{ obyekt_id: 1, shartnoma_id: 1, kat: 'МАТ', summa: 900 }, { obyekt_id: 1, shartnoma_id: 1, kat: 'ЧЕЛ', summa: 200 }],
      tolov: [{ obyekt_id: 1, shartnoma_id: 1, summa: 1500, tur: 'avans' }, { obyekt_id: 1, shartnoma_id: 1, summa: 100, tur: 'qaytarim' }],
    });
    expect(root.foyda).toBe(-100); expect(root.turi).toBe('minus');
    expect(root.pul).toBe(300); expect(root.tushgan).toBe(1400);
    expect(root.sabab).toContain('125'); // material: (900-400)/400
    expect(root.bola[0].bola[0].bola[0].foyda).toBe(-100);
  });
  it('xarajat toifa bo‘yicha: smetada bor, kiritilmagan toifa — to‘liqlik ogohlantiradi', () => {
    const { root } = foydaZararDaraxti({ kompaniyaNom: 'K', obyektlar: [ob(1, 1, 1, paket(1000, { mat: 400, chel: 100 }))], xarajat: [{ obyekt_id: 1, shartnoma_id: null, kat: 'МАТ', summa: 100 }], tolov: [] });
    expect(root.turi).toBe('plyus'); expect(root.toliqlik).toEqual(expect.arrayContaining(['kat:chel', 'tolov']));
  });
  it('obyektsiz qator shartnomaga, ikkalasiz — faqat kompaniya jamiga (taqsimlanmagan)', () => {
    const { root, taqsimlanmaganXarajat } = foydaZararDaraxti({
      kompaniyaNom: 'K', obyektlar: [ob(1, 1, 7, paket(1000)), ob(2, 2, null, paket(500))],
      xarajat: [{ obyekt_id: null, shartnoma_id: 7, kat: 'OTK', summa: 10 }, { obyekt_id: null, shartnoma_id: null, kat: null, summa: 3 }], tolov: [],
    });
    expect(root.xarajat).toBe(13); expect(taqsimlanmaganXarajat).toBe(3);
    const l1 = root.bola.find((x) => x.nom === 'L1')!; const l2 = root.bola.find((x) => x.nom === 'L2')!;
    expect(l1.xarajat).toBe(10); expect(l2.xarajat).toBeNull();
    expect(root.bajarilgan?.ustamali).toBe(1500);
  });
});
