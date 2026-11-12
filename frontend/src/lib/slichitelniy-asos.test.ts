import { describe, expect, it } from 'vitest';
import {
  AsosXarita, FARQ_CHEGARA, amalBoyichaGuruh, aosrMatni, asosMatniQator, farqliMi, qarorEgasi, tayyorlikFoiz,
  type AsosAosr, type AsosJavob, type AsosYetishmaydi,
} from './slichitelniy-asos';
import { slichitelniyHujjatXlsx, slichitelniyModeli } from './slichitelniy-vedomost';
import { hujjatTekshir } from './hujjat-yozuvchi';
import type { T2Qator, T2QatorHolat } from '../api/supabase';

const aosr = (id: number, x: Partial<AsosAosr> = {}): AsosAosr => ({
  id, raqam: `A-000${id}`, sana: '2026-10-12', tur: 'aosr', holat: 'yangi', ish_nomi: 'Ish', asos_holat: 'qoralama', tasdiq_vaqti: null,
  taqdim_id: null, taqdim_holat: null, qaror_vaqti: null, qaror_izoh: null, qaror_kompaniya: null, qaror_kim: null, ...x,
});

describe('farq chegarasi', () => {
  it('yaxlitlash shovqini farq emas; smetada yo‘q ish farqli; fakt yo‘q — farqli emas (NULL ≠ 0)', () => {
    expect(FARQ_CHEGARA).toBe(0.0005);
    expect(farqliMi(4.6484, 4.648)).toBe(false);
    expect(farqliMi(10, 12)).toBe(true);
    expect(farqliMi(10, 6)).toBe(true);
    expect(farqliMi(0, 3)).toBe(true);
    expect(farqliMi(null, 3)).toBe(true);
    expect(farqliMi(10, 0)).toBe(false);
    expect(farqliMi(10, null)).toBe(false);
  });
});

describe('asos matni', () => {
  it('tasdiqlangan АОСР: raqam, sana, kim/qaysi kompaniya/qaysi sifatda, hajm', () => {
    const a = aosr(1, { asos_holat: 'tasdiqlangan', holat: 'tasdiqlangan', qaror_vaqti: '2026-10-14T08:00:00Z', qaror_kim: 'Ism', qaror_kompaniya: 'Kompaniya' });
    expect(aosrMatni(a, 12)).toBe('АОСР № A-0001 от 12.10.2026 — принят (Ism, Kompaniya) 14.10.2026; объем по акту 12');
  });
  it('nazorat_turi / nomidan_kompaniya bo‘lsa ko‘rsatiladi, bo‘lmasa xato bermaydi', () => {
    const oddiy = aosr(1, { qaror_vaqti: '2026-10-14T08:00:00Z', qaror_kim: 'Ism', qaror_kompaniya: 'Texnadzor' });
    expect(qarorEgasi(oddiy)).toBe('Ism, Texnadzor');
    const yangi = { ...oddiy, nomidan_kompaniya: 'Buyurtmachi', nazorat_turi: 'autsorsing' };
    expect(qarorEgasi(yangi)).toBe('Ism, Texnadzor, от имени: Buyurtmachi, autsorsing');
    expect(qarorEgasi({ ...oddiy, qaror_egasi: 'tayyor matn' })).toBe('tayyor matn');
  });
  it('ichki nazorat — alohida belgi, tashqi tasdiq emas; tuzatish izohi ko‘rinadi', () => {
    expect(aosrMatni(aosr(2, { asos_holat: 'ichki' }), null)).toContain('внутренний контроль подрядчика (не заменяет внешнего)');
    expect(aosrMatni(aosr(3, { asos_holat: 'tuzatish', qaror_vaqti: '2026-10-15T00:00:00Z', qaror_izoh: 'Уточните объем' }), 2)).toContain(': Уточните объем');
  });
  it('farqli qatorda asos yo‘q — aniq belgi; farqsiz qatorda bo‘sh; hajm yetmasa — qisman hisob', () => {
    const j: AsosJavob = { ok: true, asoslar: [{ qator_id: 7, asos_holat: 'hajm_yetmaydi', farqli: true, smeta_hajm: 10, fakt_hajm: 6, asoslangan_hajm: 4, tasdiq_hajm: 4, aosr: [{ id: 3, hajm: 4 }] }], aosrlar: [aosr(3, { asos_holat: 'tasdiqlangan' })] };
    const x = new AsosXarita(j);
    expect(asosMatniQator(x, 99, true)).toBe('основание отсутствует');
    expect(asosMatniQator(x, 99, false)).toBe('');
    expect(asosMatniQator(null, 99, true)).toBe('');
    const t = asosMatniQator(x, 7, true, 6);
    expect(t).toContain('АОСР № A-0003');
    expect(t).toContain('подтверждено объема: 4 из 6');
  });
});

describe('tayyorlik', () => {
  it('amal bo‘yicha guruh (ommaviy amal uchun) va tayyorlik foizi', () => {
    const r = (id: number, amal: AsosYetishmaydi['amal']): AsosYetishmaydi => ({ qator_id: id, tur: 'bl', kod: null, nom: null, birlik: null, smeta_hajm: 1, fakt_hajm: 2, farq_hajm: 1, asos_holat: 'yoq', aosr_soni: 0, amal });
    const g = amalBoyichaGuruh([r(1, 'javob_kutilmoqda'), r(2, 'aosr_yarat'), r(3, 'aosr_yarat'), r(4, 'texnadzorga_yubor')]);
    expect(g.map((x) => [x.amal, x.soni])).toEqual([['aosr_yarat', 2], ['texnadzorga_yubor', 1], ['javob_kutilmoqda', 1]]);
    expect(g[0].qatorIdlar).toEqual([2, 3]);
    const t = { farqli: 4, ortiq: 2, kam: 2, smetada_yoq: 0, asosli: 3, tasdiqlagan: 1, kutilmoqda: 1, tuzatish: 1, qoralama: 0, hajm_yetmaydi: 0, asossiz: 1 };
    expect(tayyorlikFoiz(t)).toBe(25);
    expect(tayyorlikFoiz({ ...t, farqli: 0, tasdiqlagan: 0 })).toBe(100);
    expect(tayyorlikFoiz(null)).toBeNull();
  });
});

function q(id: number, ota_id: number | null, tur: string, hajm: number | null, extra: Partial<T2Qator> = {}): T2Qator {
  return {
    id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'К' + id, nom: 'Позиция ' + id,
    birlik: 'м3', hajm, narx: 1000, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...extra,
  };
}
function h(qator_id: number, fakt_hajm: number, f2_hajm = 0, f2_summa = 0): T2QatorHolat {
  return {
    id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null,
    smeta_summa: null, fakt_hajm, fakt_summa: 0, f2_hajm, f2_summa, qoldiq_hajm: null, qoldiq_summa: null,
  };
}

describe('slichitelniy xlsx: «Основание» ustuni va asoslar reestri', () => {
  // bl2 ЗАСЫПКА (10; fakt 12, asos bor) → rs3; bl5 БЕТОН (4; fakt 6 — asos YO‘Q); bl7 (4; fakt 4 — farqsiz)
  const QATOR = [
    q(1, null, 'rz', null, { nom: 'РАЗДЕЛ' }),
    q(2, 1, 'bl', 10, { nom: 'ЗАСЫПКА' }),
    q(3, 2, 'rs', 20, { nom: 'ТРУД', narx: 25_000 }),
    q(5, 1, 'bl', 4, { nom: 'БЕТОН' }),
    q(7, 1, 'bl', 4, { nom: 'ЩЕБЕНЬ' }),
  ];
  const HOLAT = [h(2, 12), h(3, 24), h(5, 6), h(7, 4)];
  const asosJavob: AsosJavob = {
    ok: true,
    asoslar: [{ qator_id: 2, asos_holat: 'tasdiqlangan', farqli: true, smeta_hajm: 10, fakt_hajm: 12, asoslangan_hajm: 12, tasdiq_hajm: 12, aosr: [{ id: 1, hajm: 12 }] }],
    aosrlar: [aosr(1, { asos_holat: 'tasdiqlangan', holat: 'tasdiqlangan', qaror_vaqti: '2026-10-14T08:00:00Z', qaror_kim: 'Ism', qaror_kompaniya: 'Kompaniya' })],
  };

  it('asos berilsa: ustun + reestr varag‘i; asossiz farq qatori belgilanadi; hisobot soni; asl summalar o‘zgarmaydi', () => {
    const m = slichitelniyModeli(QATOR, HOLAT);
    const oddiy = slichitelniyHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25' });
    const asosli = slichitelniyHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25', asos: new AsosXarita(asosJavob) });
    expect(oddiy.asos).toBeNull();
    expect(asosli.asos).toEqual({ farqli: 2, asosli: 1, tasdiqlagan: 1, asossiz: 1 });
    expect(asosli.kOplata).toEqual(oddiy.kOplata);
    const t0 = hujjatTekshir(oddiy.bytes);
    const t1 = hujjatTekshir(asosli.bytes);
    expect(t0.varaqlar.length).toBe(1);
    expect(t1.varaqlar.length).toBe(2);
    expect(t1.dollarFormulalar).toEqual([]);
    expect(t1.keshsizFormulalar).toEqual([]);
    const matn = t1.matnlar.join('\n').toLowerCase();  // varaq matnlari katta harfda (RasmiyVaraq qoidasi)
    expect(matn).toContain('основание (аоср, решение технадзора)');
    expect(matn).toContain('аоср № a-0001 от 12.10.2026 — принят (ism, kompaniya) 14.10.2026; объем по акту 12');
    expect(matn.split('основание отсутствует').length - 1).toBeGreaterThanOrEqual(1);
    expect(matn).toContain('реестр документов-оснований');
    // formulali summalar bir xil (asos ustuni pul katagiga tegmaydi)
    const g = (t: ReturnType<typeof hujjatTekshir>) => t.varaqlar[0].kataklar.filter((k) => /^[GIKM]\d+$/.test(k.ref)).map((k) => `${k.ref.replace(/\d+$/, "")}=${k.v}`);
    expect(g(t1).slice(0, g(t0).length)).toEqual(g(t0));  // titul bir qator ko'payadi (qator raqamlari siljiydi) va izohlar imzodan keyin qo'shiladi: ustun/qiymat ketma-ketligi bir xil
  });
});
