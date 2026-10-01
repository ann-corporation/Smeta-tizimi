import { describe, expect, it } from 'vitest';
import { aosrReestrXlsx, labReestrXlsx } from './ijro-reestr-export';
import { hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import type { AosrV2, LabProtokol } from '../api/t2-ijro';

const akt = (id: number, o: Partial<AosrV2>): AosrV2 => ({
  id, kompaniya_id: 1, obyekt_id: 1, obyekt: 'Объект', tur: 'aosr', raqam: String(id), sana: '2026-09-0' + id,
  ish_nomi: 'Армирование фундамента', ish_tavsifi: null, boshlanish_sana: '2026-09-01', tugash_sana: '2026-09-03',
  bajarilgan: null, blank_varianti: 'subpudratchisiz', loyiha_tashkiloti: null, loyiha_hujjati: null, materiallar: null,
  chetlanishlar: null, keyingi_ishlar: null, komissiya: [], pdf_url: null, izoh: null, holat: 'tasdiqlangan',
  versiya: 1, yaratildi: '', yangilandi: '', boglangan_ish_soni: 1, protokol_soni: 1, ...o,
});
const prot = (id: number, o: Partial<LabProtokol>): LabProtokol => ({
  id, kompaniya_id: 1, obyekt_id: 1, obyekt: 'Объект', laboratoriya_id: 5, laboratoriya: 'ООО «Лаб»', laboratoriya_inn: null,
  raqam: 'П-' + id, sana: '2026-09-1' + id, sinov_turi: 'beton', konstruksiya: 'Фундамент Фм-1', marka: 'B25', hajm: 12.5,
  birlik: 'м3', natija: 'mos', invoys_raqam: '77', invoys_sana: '2026-09-20', summa: 1_000_000, fayl_document_id: null,
  izoh: null, holat: 'faol', versiya: 1, yaratildi: '', yangilandi: '', aosr_ids: [1], qator_ids: [], ...o,
});

describe('Ijro reestrlari — hujjat (H1–H9)', () => {
  it('АОСР reestri: bekor chiqmaydi, sana tartibi, diqqat, imzolar', () => {
    const { bytes, faylNomi } = aosrReestrXlsx([
      akt(2, {}), akt(1, {}), akt(3, { holat: 'bekor', ish_nomi: 'БЕКОР ИШ' }), akt(4, { raqam: null, holat: 'yangi' }),
    ], { obyektNomi: 'Объект', sana: '2026-10-01' });
    namunaSaqla('reestr-aosr.xlsx', bytes);
    expect(faylNomi).toBe('Объект_РЕЕСТР_АОСР_2026-10-01.xlsx');
    const t = hujjatTekshir(bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР']).yoq).toEqual([]);
    expect(t.matnlar).not.toContain('БЕКОР ИШ');
    expect(t.matnlar.some((x) => x.includes('нет номера'))).toBe(true);
    expect(t.matnlar.some((x) => x.startsWith('Всего актов: 3'))).toBe(true);
  });

  it('Lab reestri: ИТОГО formulasi keshlangan, mos emas va bog‘lanmagan — diqqatda', () => {
    const { bytes, faylNomi } = labReestrXlsx([
      prot(1, {}), prot(2, { natija: 'mos_emas', summa: 500_000.5 }), prot(3, { aosr_ids: [], summa: null }), prot(4, { holat: 'bekor', summa: 9e9 }),
    ], { obyektNomi: 'Объект', sana: '2026-10-01' });
    namunaSaqla('reestr-lab.xlsx', bytes);
    expect(faylNomi).toBe('Объект_РЕЕСТР_ЛАБ_ПРОТОКОЛОВ_2026-10-01.xlsx');
    const t = hujjatTekshir(bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(imzoRollariBormi(t, ['ПОДРЯДЧИК', 'ТЕХНАДЗОР', 'СОСТАВИЛ']).yoq).toEqual([]);
    const v = t.varaqlar[0];
    const itogo = v.kataklar.find((k) => k.matn === 'ИТОГО')!;
    const row = itogo.ref.replace(/^[A-Z]+/, '');
    expect(Number(v.kataklar.find((k) => k.ref === `M${row}`)?.v)).toBe(1_500_000.5);
    expect(t.matnlar.some((x) => x.includes('не соответствует'))).toBe(true);
    expect(t.matnlar.some((x) => x.includes('не привязан к АОСР'))).toBe(true);
  });
});
