import { describe, expect, it } from 'vitest';
import { narxTakliflari } from './taklif';
import { narxAsoslashXlsx, manbaRekviziti } from '../narx-asoslash-export';
import { hujjatTekshir, imzoRollariBormi } from '../hujjat-yozuvchi';
import type { NarxDalilHolat, NarxTaklif } from '../../api/t2-narx-dalil';

const T = (p: Partial<NarxTaklif>): NarxTaklif => ({
  kompaniya_id: 1, obyekt_id: 1, qator_id: 1, tur: 'rs', kat: 'МАТ', kod: null, nom: 'Бетон B25', birlik: 'м3', smeta_narx: 1000,
  manba_qator_id: 1, manba_id: 1, manba_tur: 'katalog', manba_nom: 'Каталог', manba_raqam: null, manba_sana: null,
  yil: 2026, kvartal: 1, region: null, yetkazuvchi: null, nds_holati: 'nomalum', manba_kod: null, manba_nom_qator: 'Бетон B25',
  manba_birlik: 'м3', manba_narx: 1000, moslik: 'nom_birlik', ...p,
});

describe('Narx takliflari (egasi qoidalari)', () => {
  it('МАШ — eng qimmat kalkulyatsiya', () => {
    const n = narxTakliflari([
      T({ qator_id: 5, kat: 'МАШ', manba_qator_id: 1, manba_tur: 'kalkulyatsiya_mash', manba_narx: 150_000 }),
      T({ qator_id: 5, kat: 'МАШ', manba_qator_id: 2, manba_tur: 'kalkulyatsiya_mash', manba_narx: 180_000 }),
      T({ qator_id: 5, kat: 'МАШ', manba_qator_id: 3, manba_tur: 'katalog', manba_narx: 120_000 }),
    ]);
    expect(n[0].tavsiya.manba_qator_id).toBe(2);
    expect(n[0].boshqalar.map((b) => b.manba_qator_id)).toEqual([1, 3]);
  });

  it('ЧЕЛ — eng yangi kvartal, obyekt regioni ustun', () => {
    const q = [
      T({ qator_id: 7, kat: 'ЧЕЛ', manba_qator_id: 1, manba_tur: 'chel_chas', yil: 2026, kvartal: 3, region: 'Ташкент', manba_narx: 30_000 }),
      T({ qator_id: 7, kat: 'ЧЕЛ', manba_qator_id: 2, manba_tur: 'chel_chas', yil: 2026, kvartal: 2, region: 'Навоийская обл.', manba_narx: 25_000 }),
      T({ qator_id: 7, kat: 'ЧЕЛ', manba_qator_id: 3, manba_tur: 'chel_chas', yil: 2025, kvartal: 4, region: 'Навоийская обл.', manba_narx: 24_000 }),
    ];
    expect(narxTakliflari(q)[0].tavsiya.manba_qator_id).toBe(1);
    expect(narxTakliflari(q, { region: 'навоийская обл.' })[0].tavsiya.manba_qator_id).toBe(2);
  });

  it('МАТ — katalog, eng yangi kvartal; kod mosligi ustun; og‘ish foizi; narxsiz nomzod tashlanadi', () => {
    const n = narxTakliflari([
      T({ qator_id: 9, manba_qator_id: 1, manba_tur: 'faktura', manba_sana: '2026-09-01', manba_narx: 900 }),
      T({ qator_id: 9, manba_qator_id: 2, yil: 2026, kvartal: 3, manba_narx: 1100 }),
      T({ qator_id: 9, manba_qator_id: 3, yil: 2026, kvartal: 2, manba_narx: 1050 }),
      T({ qator_id: 9, manba_qator_id: 4, manba_narx: null as unknown as number }),
    ]);
    expect(n[0].tavsiya.manba_qator_id).toBe(2);
    expect(n[0].farqFoiz).toBe(10);
    expect(n[0].boshqalar).toHaveLength(2);
    const k = narxTakliflari([T({ qator_id: 1, manba_qator_id: 1, kvartal: 3 }), T({ qator_id: 1, manba_qator_id: 2, kvartal: 1, moslik: 'kod' })]);
    expect(k[0].tavsiya.manba_qator_id).toBe(2);
  });
});

describe('Обоснование цен — hujjat', () => {
  const D = (qator_id: number, p: Partial<NarxDalilHolat> = {}): NarxDalilHolat => ({
    id: qator_id, kompaniya_id: 1, obyekt_id: 1, qator_id, tur: 'rs', kat: 'МАТ', kod: null, nom: 'x', birlik: 'м3', hajm: 1,
    hozirgi_narx: 1000, smeta_narx: 1000, manba_narx: 1100, izoh: null, kim: null, vaqt: '',
    manba_id: 1, manba_tur: 'faktura', manba_nom: 'Счет-фактура', manba_raqam: '125', manba_sana: '2026-08-12',
    yil: null, kvartal: null, region: null, yetkazuvchi: 'ООО «Бетон»', yetkazuvchi_inn: '301234567', nds_holati: 'nds_siz',
    fayl_document_id: null, manba_kod: null, manba_nom_qator: 'x', manba_birlik: 'м3', ...p,
  });

  it('rekvizit matni', () => {
    expect(manbaRekviziti(D(1))).toBe('Счет-фактура, № 125 от 12.08.2026, ООО «Бетон» (ИНН 301234567), без НДС');
    expect(manbaRekviziti(D(1, { manba_nom: 'Каталог', manba_raqam: null, manba_sana: null, yil: 2026, kvartal: 3, region: 'Навоийская обл.', yetkazuvchi: null, yetkazuvchi_inn: null, nds_holati: 'nomalum' })))
      .toBe('Каталог, 3 кв. 2026, Навоийская обл.');
  });

  it('dalilli va dalilsiz resurslar, formulalar tirik, $ yo‘q, imzolar', () => {
    const r = narxAsoslashXlsx(
      [
        { qator_id: 1, kat: 'МАТ', kod: 'C101', nom: 'Бетон B25', birlik: 'м3', hajm: 12.5, narx: 1000 },
        { qator_id: 2, kat: 'МАШ', kod: null, nom: 'Кран 25 т', birlik: 'маш.-ч', hajm: 8, narx: 150_000 },
        { qator_id: 3, kat: null, kod: null, nom: 'Прочее', birlik: null, hajm: null, narx: null },
      ],
      [D(1)],
      { obyektNomi: 'Амфитеатр', sana: '2026-10-01', imzo: { pudratchi: 'ООО «Пудратчи»' } },
    );
    expect(r.tasdiqlangan).toBe(1);
    expect(r.dalilsiz).toBe(2);
    expect(r.faylNomi).toBe('Амфитеатр_ОБОСНОВАНИЕ_ЦЕН_2026-10-01.xlsx');
    const t = hujjatTekshir(r.bytes);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['ОБОСНОВАНИЕ СТОИМОСТИ РЕСУРСОВ, ПРИНЯТЫХ В СМЕТНОЙ ДОКУМЕНТАЦИИ', 'МАТЕРИАЛЫ', 'МАШИНЫ И МЕХАНИЗМЫ (МАШ.-ЧАС)', 'ПОЗИЦИИ БЕЗ ДОКУМЕНТА-ОСНОВАНИЯ ЦЕНЫ (2)']));
    expect(t.matnlar.some((m) => m.includes('Кран 25 т') && m.includes('документ-основание цены не приложен'))).toBe(true);
    expect(imzoRollariBormi(t, ['ПОДРЯДЧИК', 'СОСТАВИЛ', 'ПРОВЕРИЛ']).yoq).toEqual([]);
  });
});
