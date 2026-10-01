import { describe, expect, it } from 'vitest';
import { abcHisobla, abcTekshir, engYaxshiNarx, katAniqla, type AbcResurs } from './ish-abc';

const r = (o: Partial<AbcResurs>): AbcResurs => ({ kat: 'МАТ', kod: '', nom: 'x', birlik: 'м3', norma: '1', narx: '', manba: 'qolda', ...o });

describe('ish ABC hisobi (ШНК)', () => {
  it('hajm = norma × ish hajmi, summa = hajm × narx, ish summasi = yig‘indi (real kladka qatori)', () => {
    const h = abcHisobla('0,5', [
      r({ kat: 'ЧЕЛ', norma: '170,17', narx: '29421' }),
      r({ kat: 'МАТ', norma: '3.8808', narx: '1360000' }),
      r({ kat: 'МАШ', norma: '0.11', narx: '' }),
    ]);
    expect(h.qatorlar.map((x) => x.hajm)).toEqual([85.085, 1.9404, 0.055]);
    expect(h.qatorlar.map((x) => x.summa)).toEqual([2503285.79, 2638944, null]);
    expect(h.jami).toBe(5142229.79);              // bazadagi sinov natijasi bilan aynan bir xil
    expect(h.jamiKat).toMatchObject({ ЧЕЛ: 2503285.79, МАТ: 2638944, МАШ: 0 });
    expect(h.narxsiz).toBe(1);
    expect(h.ishNarxi).toBe(10284459.58);
  });

  it('tekshiruv: ish nomi/birlik/hajm, resurs norma, sabab', () => {
    const x = abcTekshir({ rejim: 'ish', ish: { nom: '', birlik: 'м3', hajm: '0' }, resurslar: [r({ norma: '0' })], sabab: '' });
    expect(x.map((e) => e.joy).sort()).toEqual(['ish', 'ish', 'r0', 'sabab']);
    expect(abcTekshir({ rejim: 'ish', ish: { nom: 'a', birlik: 'м3', hajm: '1' }, resurslar: [r({})], sabab: 's' })).toEqual([]);
    expect(abcTekshir({ rejim: 'resurs', resurslar: [], sabab: 's' })[0].joy).toBe('resurs');
  });

  it('eng yaxshi narx: shu smeta → shu shartnoma → boshqa shartnoma; katalog avtomatik emas', () => {
    expect(engYaxshiNarx([{ manba: 'katalog', narx: 5, izoh: '' }, { manba: 'smeta', narx: 7, izoh: '' }])?.narx).toBe(7);
    expect(engYaxshiNarx([{ manba: 'smeta', narx: 7, izoh: '' }, { manba: 'smeta_shartnoma', narx: 8, izoh: '' }])?.manba).toBe('smeta_shartnoma');
    expect(engYaxshiNarx([{ manba: 'smeta_shartnoma', narx: 8, izoh: '' }, { manba: 'smeta_obyekt', narx: 9, izoh: '' }])?.manba).toBe('smeta_obyekt');
    expect(engYaxshiNarx([{ manba: 'katalog', narx: 5, izoh: '' }])).toBeNull();
    expect(engYaxshiNarx([])).toBeNull();
  });

  it('normasiz resurs: aniq hajm, norma talab qilinmaydi', () => {
    const h = abcHisobla('2', [r({ norma: '', hajm: '15', narx: '1000' })]);
    expect(h.qatorlar[0]).toEqual({ hajm: 15, summa: 15000 });
    expect(abcTekshir({ rejim: 'ish', ish: { nom: 'a', birlik: 'м3', hajm: '1' }, resurslar: [r({ norma: '', hajm: '3' })], sabab: 's' })).toEqual([]);
    expect(abcTekshir({ rejim: 'ish', ish: { nom: 'a', birlik: 'м3', hajm: '1' }, resurslar: [r({ norma: '', hajm: '' })], sabab: 's' })[0].joy).toBe('r0');
  });

  it('kategoriya aniqlash', () => {
    expect(katAniqla('ЧЕЛ')).toBe('ЧЕЛ');
    expect(katAniqla(null, 'ob')).toBe('ОБ');
    expect(katAniqla(null, 'rs', 'МАШ.-Ч')).toBe('МАШ');
    expect(katAniqla(null, 'rs', 'м3')).toBe('МАТ');
  });
});
