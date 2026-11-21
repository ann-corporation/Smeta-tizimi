import { describe, expect, it } from 'vitest';
import { YetkazishXato, obyektHolatlari, paketYigish, yasashYengilmi, type Yetkazuvchi } from './yigish';
import { eskirganBelgila, navbatManbaId, navbatSorovlari, tayyorlashKerak, tezlatSorovlari } from './eskirgan';
import { kengaytmaBilan } from './fayl-nomi';
import { tayyorlaSikl, type TayyorlaJavob } from './tayyorla';
import { f2DisktanOlinadi, paketReja, rejaF2Disk } from './nomzod';
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
    expect(eng.yengil).toBe(4); expect(eng.ogir).toBe(2);
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

describe('fayl nomi kengaytmasi (kengaytmasiz Disk nomi ZIP da «Excel emas» bo\'lib chiqardi)', () => {
  const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]); const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0]);
  it('xlsx mime / PK baytlari -> .xlsx; pdf -> .pdf; bor kengaytma o\'zgarmaydi', () => {
    const nom = 'F-2 №818 — Fast Food 2-etaj №1 — 2026-11';
    expect(kengaytmaBilan(nom, xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(nom + '.xlsx');
    expect(kengaytmaBilan(nom, xlsx, null)).toBe(nom + '.xlsx');
    expect(kengaytmaBilan(nom, pdf, 'application/pdf')).toBe(nom + '.pdf');
    expect(kengaytmaBilan(nom, pdf, null)).toBe(nom + '.pdf');
    expect(kengaytmaBilan('a.XLSX', xlsx)).toBe('a.XLSX');
    expect(kengaytmaBilan('v1.5 hisobot', xlsx)).toBe('v1.5 hisobot.xlsx');
    expect(kengaytmaBilan('', xlsx, null, 'Zaxira')).toBe('Zaxira.xlsx');
  });
  it('paketYigish: Disk ham, yasash ham kengaytmasiz nom qaytarsa - fayl .xlsx bilan (guard)', async () => {
    const d: Yetkazuvchi = { diskdan: async () => ({ bytes: xlsx, faylNomi: 'F-2 №1' }), yasa: async () => ({ bytes: xlsx, faylNomi: 'F-2 №2', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
    const y = await paketYigish({ diskdan: [N({ kalit: 'm29:1', tur: 'm29' })], yasash: [N({ kalit: 'f2:2', fayl_id: null })] }, d);
    expect(y.fayllar.map((f) => f.faylNomi)).toEqual(['F-2 №1.xlsx', 'F-2 №2.xlsx']);
  });
});

describe('F-2: yangi va to\'langan Diskdan to\'g\'ridan; eskirgan/yo\'q/to\'lanmagan - server dvigateli', () => {
  const T = (o: object) => N({ tolangan: true, ...o } as never);
  it('qoidalar', () => {
    expect(f2DisktanOlinadi(T({}))).toBe(true);
    expect(f2DisktanOlinadi(T({ yangilanmoqda: true }))).toBe(false); // eskirgan
    expect(f2DisktanOlinadi(T({ fayl_id: null }))).toBe(false);       // Diskda yo'q
    expect(f2DisktanOlinadi(T({ tolangan: false }))).toBe(false);      // token yechilishi kerak
    expect(f2DisktanOlinadi(T({ navbat_holat: 'xato' }))).toBe(false);
  });
  it('reja: 4 ta «Excel tayyor» F-2 Diskdan, eskirganlari yasashga', () => {
    const f2 = [1, 2, 3, 4].map((i) => T({ kalit: `f2:${i}`, akt_id: i })).concat([5, 6, 7].map((i) => T({ kalit: `f2:${i}`, akt_id: i, yangilanmoqda: true })));
    const r0 = paketReja(f2, new Set(f2.map((n) => n.kalit)));
    const r = rejaF2Disk(r0);
    expect(r.diskdan.map((n) => n.kalit)).toEqual(['f2:1', 'f2:2', 'f2:3', 'f2:4']);
    expect(r.yasash.map((n) => n.kalit)).toEqual(['f2:5', 'f2:6', 'f2:7']);
  });
});

describe('oldindan tayyorlash', () => {
  const E = (o: object) => N(o as never);
  it('kerakli hujjatlar: F-2 yo\'q/eskirgan; boshqa tur faqat eskirgan; takror/taxminiy/xato/tanlanmagan tashlanadi', () => {
    const q = [E({ kalit: 'a', akt_id: 1 }), E({ kalit: 'b', akt_id: 2, yangilanmoqda: true }), E({ kalit: 'c', akt_id: 3, fayl_id: null }), E({ kalit: 'd', akt_id: 4, fayl_id: null, takror: true }),
      E({ kalit: 'e', akt_id: 5, yangilanmoqda: true, navbat_holat: 'xato' }), E({ kalit: 'f', tur: 'm29', yangilanmoqda: true }), E({ kalit: 'g', tur: 'm29' }), E({ kalit: 'h', akt_id: 6, yangilanmoqda: true })];
    expect(tayyorlashKerak(q, new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).map((n) => n.kalit)).toEqual(['b', 'c', 'f']);
    const s = tezlatSorovlari(tayyorlashKerak(q, null));
    expect(s.get('f2')).toEqual([2, 3, 6]); expect(s.get('m29')).toEqual([5_203_103]);
  });
  it('sikl: qolgan 0 gacha takrorlaydi; yutuq to\'xtasa (2 marta) to\'xtaydi; xatoda to\'xtaydi, maks cheklaydi', async () => {
    const qol = [5, 3, 1, 0]; let i = 0;
    const r1 = await tayyorlaSikl(async (): Promise<TayyorlaJavob> => ({ ok: true, kerak: 5, qolgan: qol[i], yangilandi: i++ === 0 ? 2 : 2, xato: 0 }));
    expect(r1).toMatchObject({ boshida: 5, qolgan: 0, urinish: 4 });
    const r2 = await tayyorlaSikl(async () => ({ ok: true, kerak: 4, qolgan: 4, yangilandi: 0, xato: 0 }));
    expect(r2.urinish).toBe(2); expect(r2.qolgan).toBe(4);
    const r3 = await tayyorlaSikl(async () => ({ ok: false, xabar: 'HTTP 500' }));
    expect(r3.xabar).toBe('HTTP 500');
    let m = 0; const r4 = await tayyorlaSikl(async () => ({ ok: true, kerak: 99, qolgan: 99 - ++m, yangilandi: 1, xato: 0 }), { maks: 3 });
    expect(r4.urinish).toBe(3);
  });
});