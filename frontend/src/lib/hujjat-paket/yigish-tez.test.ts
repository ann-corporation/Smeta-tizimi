import { describe, expect, it } from 'vitest';
import { YetkazishXato, obyektHolatlari, paketYigish, yasashYengilmi, type Yetkazuvchi } from './yigish';
import { eskirganBelgila, navbatManbaId, navbatSorovlari } from './eskirgan';
import type { Nomzod } from './nomzod';

const N = (o: Partial<Nomzod> & { yangilanmoqda?: boolean } = {}): Nomzod => ({
  kalit: 'f2:1', tur: 'f2', sarlavha: 'F-2 1', holat: 'tasdiqlangan', loyiha_id: 1, loyiha_nom: 'L', shartnoma_id: 3, shartnoma_raqam: '7', obyekt_id: 5, obyekt_nom: 'Obyekt A',
  oy: '2031-03', akt_id: 1, forma3_id: null, taxminiy: false, takror: false, qator_soni: 10, fayl_id: 11, versiya: 2, bayt: 100, yasash: false, ...o,
} as Nomzod);
const bayt = new Uint8Array([1]);

describe('paketYigish: hovuzlar, qayta urinish, to\'xtatish, holatlar', () => {
  it('Disk va yasash hovuzlari BIR VAQTDA ishlaydi (avval ketma-ket edi)', async () => {
    let diskda = 0; let yasashda = 0; let birga = 0;
    const d: Yetkazuvchi = {
      diskdan: async () => { diskda++; birga = Math.max(birga, diskda + yasashda); await new Promise((r) => setTimeout(r, 10)); diskda--; return { bytes: bayt, faylNomi: 'a.xlsx' }; },
      yasa: async () => { yasashda++; birga = Math.max(birga, diskda + yasashda); await new Promise((r) => setTimeout(r, 10)); yasashda--; return { bytes: bayt, faylNomi: 'b.xlsx', manba: 'yasaldi' }; },
    };
    const reja = { diskdan: [1, 2, 3, 4].map((i) => N({ kalit: `m29:${i}`, tur: 'm29' })), yasash: [5, 6, 7, 8].map((i) => N({ kalit: `f2:${i}`, fayl_id: null })) };
    const y = await paketYigish(reja, d);
    expect(y.fayllar).toHaveLength(8);
    expect(birga).toBeGreaterThan(4); // Disk 4 + yasash 3 bir vaqtda
  });

  it('yasash: Diskda tayyor (yengil) 4 parallel, og\'ir 3 parallel; tartib reja tartibida', async () => {
    const hozir = { yengil: 0, ogir: 0 }; const eng = { yengil: 0, ogir: 0 };
    const d: Yetkazuvchi = {
      diskdan: async () => ({ bytes: bayt, faylNomi: 'x' }),
      yasa: async (n) => {
        const k = yasashYengilmi(n) ? 'yengil' : 'ogir';
        hozir[k]++; eng[k] = Math.max(eng[k], hozir[k]); await new Promise((r) => setTimeout(r, 10)); hozir[k]--;
        return { bytes: bayt, faylNomi: `${n.kalit}.xlsx`, manba: k === 'yengil' ? 'disk' : 'yasaldi' };
      },
    };
    const yasash = [...[1, 2, 3, 4, 5, 6].map((i) => N({ kalit: `f2:${i}` })), ...[7, 8, 9, 10].map((i) => N({ kalit: `f2:${i}`, fayl_id: null }))];
    const y = await paketYigish({ diskdan: [], yasash }, d);
    expect(eng.yengil).toBe(4); expect(eng.ogir).toBe(3);
    expect(y.fayllar.map((f) => f.n.kalit)).toEqual(yasash.map((n) => n.kalit));
    expect(y.holatlar!.filter((h) => h.natija === 'tayyor')).toHaveLength(6);
    expect(y.holatlar!.filter((h) => h.natija === 'yangilandi')).toHaveLength(4);
  });

  it('vaqtinchalik xato bir marta qayta uriladi; doimiy xato - sabab bilan «xato» (jim tashlanmaydi)', async () => {
    let urinish = 0;
    const d: Yetkazuvchi = {
      diskdan: async () => ({ bytes: bayt, faylNomi: 'x' }),
      yasa: async (n) => {
        if (n.kalit === 'f2:1') { if (++urinish < 2) throw new YetkazishXato('Tarmoq', { vaqtinchalik: true }); return { bytes: bayt, faylNomi: 'a.xlsx' }; }
        throw new YetkazishXato('Yasalmadi (HTTP 500)');
      },
    };
    const y = await paketYigish({ diskdan: [], yasash: [N({ kalit: 'f2:1' }), N({ kalit: 'f2:2', fayl_id: null, obyekt_id: 6, obyekt_nom: 'Obyekt B' })] }, d, { qaytaKutish: 0 });
    expect(urinish).toBe(2);
    expect(y.fayllar).toHaveLength(1);
    expect(y.xatolar).toHaveLength(1);
    expect(y.holatlar!.find((h) => h.kalit === 'f2:2')).toMatchObject({ natija: 'xato', sabab: 'Yasalmadi (HTTP 500)' });
  });

  it('token yetmasa qolgan yasash to\'xtatiladi, lekin har biri sabab bilan xatolarga yoziladi; Disk fayllari saqlanadi', async () => {
    let chaqiruv = 0;
    const d: Yetkazuvchi = {
      diskdan: async () => ({ bytes: bayt, faylNomi: 'x' }),
      yasa: async () => { chaqiruv++; await new Promise((r) => setTimeout(r, 5)); throw new YetkazishXato('Tokenlar yetarli emas', { toxtat: true }); },
    };
    const yasash = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => N({ kalit: `f2:${i}`, fayl_id: null }));
    const y = await paketYigish({ diskdan: [N({ kalit: 'm29:1', tur: 'm29' })], yasash }, d, { yasashParallel: 2 });
    expect(chaqiruv).toBeLessThan(10); // hammasi urinilmadi
    expect(y.fayllar).toHaveLength(1);
    expect(y.xatolar).toHaveLength(10); // lekin hech biri jim emas
    expect(y.xatolar.every((x) => x.includes('Tokenlar yetarli emas'))).toBe(true);
  });

  it('eskirgan: fonda yangilanayotgan Disk versiyasi «eskirgan» deb belgilanadi; obyekt bo\'yicha yig\'indi', async () => {
    const d: Yetkazuvchi = { diskdan: async () => ({ bytes: bayt, faylNomi: 'x' }), yasa: async () => { throw new Error('yo\'q'); } };
    const reja = { diskdan: [N({ kalit: 'm29:1', tur: 'm29' }), N({ kalit: 'nak:1', tur: 'nakopitelniy', yangilanmoqda: true } as never)], yasash: [N({ kalit: 'f2:9', fayl_id: null, obyekt_id: 6, obyekt_nom: 'Obyekt B' })] };
    const y = await paketYigish(reja, d);
    expect(y.holatlar!.map((h) => h.natija)).toEqual(['tayyor', 'eskirgan', 'xato']);
    const o = obyektHolatlari(y.holatlar!);
    expect(o).toEqual([
      expect.objectContaining({ obyekt_nom: 'Obyekt A', jami: 2, tayyor: 1, eskirgan: 1, xato: 0 }),
      expect.objectContaining({ obyekt_nom: 'Obyekt B', jami: 1, xato: 1, xatolar: [expect.stringContaining('yo\'q')] }),
    ]);
  });
});

describe('eskirgan.ts: boshqa tur hujjatlar navbat holati', () => {
  it('manba_id kodlash SQL bilan bir xil', () => {
    expect(navbatManbaId({ tur: 'nakopitelniy', obyekt_id: 12, oy: '2031-03', forma3_id: null })).toBe(12_203_103);
    expect(navbatManbaId({ tur: 'm29', obyekt_id: 12, oy: '2031-03', forma3_id: null })).toBe(12_203_103);
    expect(navbatManbaId({ tur: 'slichitelniy', obyekt_id: 12, oy: null, forma3_id: null })).toBe(12);
    expect(navbatManbaId({ tur: 'forma3', obyekt_id: 12, oy: null, forma3_id: 77 })).toBe(77);
    expect(navbatManbaId({ tur: 'f2', obyekt_id: 12, oy: '2031-03', forma3_id: null })).toBeNull();
    expect(navbatManbaId({ tur: 'm29', obyekt_id: 12, oy: null, forma3_id: null })).toBeNull();
  });
  it('so\'rov rejasi: faqat Diskda fayli bor boshqa turlar, takrorsiz', () => {
    const q = navbatSorovlari([N({ tur: 'm29' }), N({ tur: 'm29' }), N({ tur: 'f2' }), N({ tur: 'ostatka', fayl_id: null }), N({ tur: 'slichitelniy' })]);
    expect([...q.keys()].sort()).toEqual(['m29', 'slichitelniy']);
    expect(q.get('m29')).toEqual([5_203_103]);
  });
  it('kutmoqda/ishlanmoqda - yangilanmoqda; tayyor/xato - yo\'q; manba o\'zgarmaydi (yangi massiv)', () => {
    const a = N({ tur: 'm29', kalit: 'a' }); const b = N({ tur: 'm29', kalit: 'b', oy: '2031-04' });
    const h = new Map([['m29', new Map([[5_203_103, 'kutmoqda'], [5_203_104, 'tayyor']])]]);
    const r = eskirganBelgila([a, b, N({ tur: 'f2', kalit: 'c' })], h);
    expect(r[0]).toMatchObject({ yangilanmoqda: true, navbat_holat: 'kutmoqda' });
    expect(r[1]).toMatchObject({ yangilanmoqda: false, navbat_holat: 'tayyor' });
    expect(r[2]).toBe((r[2]));
    expect((a as { yangilanmoqda?: boolean }).yangilanmoqda).toBeUndefined();
  });
});
