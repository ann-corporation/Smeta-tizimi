import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { amaldagiProtokolNarxlari, type NarxProtokolQator } from '../api/t2-narx-protokol';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yuk } from './f2-tayyor';
import { narxProtokolXlsx, protokolNomzodlari } from './narx-protokol-hujjat';
import { hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';

const P = (o: Partial<NarxProtokolQator> & { qator_id: number; yangi_narx: number }): NarxProtokolQator => ({
  id: 1, basis_id: 1, kompaniya_id: 1, obyekt_id: 8, raqam: 'ПС-20261003-01', sana: '2026-10-03', holat: 'tasdiqlangan',
  kat: 'МАТ', kod: null, nom: 'Бетон B25', birlik: 'м3', eski_narx: 900000, valid_from: '2026-11-01', valid_to: null, manba_qator_id: null, izoh: null, ...o,
});

describe('Протокол согласования цен', () => {
  it('amaldagi narx: faqat tasdiqlangan, kuchga kirgan oydan; bir nechtasidan eng yangisi', () => {
    const q = [
      P({ qator_id: 5, yangi_narx: 1_000_000 }),
      P({ qator_id: 5, yangi_narx: 1_100_000, basis_id: 2, raqam: 'ПС-2', valid_from: '2026-12-01' }),
      P({ qator_id: 6, yangi_narx: 50, holat: 'qoralama' }),
      P({ qator_id: 7, yangi_narx: 70, holat: 'bekor' }),
    ];
    expect(amaldagiProtokolNarxlari(q, '2026-10-01').size).toBe(0);
    expect(amaldagiProtokolNarxlari(q, '2026-11-01').get(5)?.narx).toBe(1_000_000);
    expect(amaldagiProtokolNarxlari(q, '2027-01-01').get(5)).toMatchObject({ narx: 1_100_000, raqam: 'ПС-2' });
    expect(amaldagiProtokolNarxlari(q, '2027-01-01').has(6)).toBe(false);
  });

  it('nomzodlar: faqat smetadan qimmat; dalil tavsiyadan ustun; banddagilar chiqmaydi', () => {
    const n = protokolNomzodlari(
      [{ qator_id: 1, kat: 'МАТ', kod: null, nom: 'Бетон', birlik: 'м3', smeta_narx: 100, manba_narx: 130, izoh: 'dalil' }],
      [
        { qator_id: 1, kat: 'МАТ', kod: null, nom: 'Бетон', birlik: 'м3', smeta_narx: 100, manba_narx: 150, manba_qator_id: 9, izoh: 'tavsiya' },
        { qator_id: 2, kat: 'МАТ', kod: null, nom: 'Песок', birlik: 'м3', smeta_narx: 100, manba_narx: 90, izoh: 'arzon' },
        { qator_id: 3, kat: 'МАТ', kod: null, nom: 'Щебень', birlik: 'м3', smeta_narx: null, manba_narx: 90, izoh: 'smetasiz' },
        { qator_id: 4, kat: 'МАТ', kod: null, nom: 'Цемент', birlik: 'т', smeta_narx: 100, manba_narx: 120, izoh: 'band' },
      ],
      new Set([4]),
    );
    expect(n.map((x) => [x.qator_id, x.yangi_narx, x.dalil])).toEqual([[1, 130, true]]);
  });

  it('F2: protokol narxi oldingi F2 va smetadan ustun, asos hujjatda', () => {
    const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }) => ({
      obyekt_id: 8, kompaniya_id: 1, ota_id: null, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3', hajm: null, narx: null, kat: null, ...o,
    } as T2Qator);
    const rows = [q({ id: 2, tur: 'bl', hajm: 10 }), q({ id: 5, tur: 'rs', ota_id: 2, kat: 'МАТ', norma: 1, narx: 900000 })];
    const holat = [{ qator_id: 2, f2_mumkin_hajm: 10 }, { qator_id: 5, f2_mumkin_hajm: 10, f2_narx: 880000 }];
    const pr = amaldagiProtokolNarxlari([P({ qator_id: 5, yangi_narx: 1_000_000 })], '2026-11-01');
    const b = f2Qur(rows, holat, pr);
    expect(b[0].ishlar[0].resurslar[0]).toMatchObject({ taklifNarx: 1_000_000, taklifManba: 'protokol', protokol: '№ ПС-20261003-01 от 03.10.2026' });
    const k = bosKiritma(); k.hajm[2] = '2';
    const qq = f2Qatorlar(b, k);
    expect(qq.find((x) => x.id === 5)).toMatchObject({ narx: 1_000_000, summa: 2_000_000, manba: 'protokol' });
    expect(f2Yuk(qq, '7').find((x) => x.qatorId === 5)?.rawSnapshot?.sourceReference).toBe('Ф-2 № 7; цена по протоколу согласования цен № ПС-20261003-01 от 03.10.2026');
    // Protokolsiz — avvalgidek oldingi F2.
    expect(f2Qur(rows, holat)[0].ishlar[0].resurslar[0].taklifManba).toBe('oldingi_f2');
  });

  it('hujjat: sarlavha, og‘ish formulasi tirik, ikki tomon imzosi', () => {
    const r = narxProtokolXlsx([
      { kat: 'МАТ', kod: 'C101', nom: 'Бетон B25', birlik: 'м3', eski_narx: 900000, yangi_narx: 1_000_000, izoh: 'Каталог, 3 кв. 2026' },
      { kat: 'МАТ', kod: 'C101', nom: 'Бетон B25', birlik: 'м3', eski_narx: 900000, yangi_narx: 1_000_000, izoh: 'Каталог, 3 кв. 2026' },
      { kat: 'МАШ', kod: null, nom: 'Кран 25 т', birlik: 'маш.-ч', eski_narx: 150000, yangi_narx: 180000, izoh: null },
    ], { obyektNomi: 'Амфитеатр', raqam: 'ПС-20261003-01', sana: '2026-10-03', imzo: { zakazchik: 'ГУП «Заказчик»' } });
    expect(r.soni).toBe(2);
    expect(r.faylNomi).toBe('Амфитеатр_ПРОТОКОЛ_ЦЕН_ПС-20261003-01_2026-10-03.xlsx');
    const t = hujjatTekshir(r.bytes);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['ПРОТОКОЛ СОГЛАСОВАНИЯ ЦЕН № ПС-20261003-01', 'МАТЕРИАЛЫ', 'МАШИНЫ И МЕХАНИЗМЫ (МАШ.-ЧАС)']));
    expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК']).yoq).toEqual([]);
  });
});
