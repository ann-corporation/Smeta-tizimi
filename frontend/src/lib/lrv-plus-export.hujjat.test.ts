/**
 * LRV_PLUS / Forma-2 (ЛРВ) — hujjat standarti. LRV_PLUS — egasining T1 ishchi
 * hujjati: ustun sarlavhalari (ҲАЖМ, НАРХ, ЖАМИ, F2 ОЛИНГАН …) va ТИП
 * belgilari (rz/bl/rs) egasining o'z matni — H9 istisnosi (ruxsat ro'yxati).
 */
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { lrvPlusFaylBaytlari, lrvPlusFaylNomi } from './lrv-plus-export';
import { NAKRUTKA_STANDART } from './nakrutka-kaskad';
import { hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import type { T2Qator, T2QatorHolat } from '../api/supabase';

function qator(p: Partial<T2Qator> & { id: number; tartib: number; tur: string }): T2Qator {
  return {
    id: p.id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: p.ota_id ?? null, daraja: p.daraja ?? 0, tartib: p.tartib,
    tur: p.tur, kod: p.kod ?? null, nom: p.nom ?? null, birlik: p.birlik ?? null, hajm: p.hajm ?? null, narx: p.narx ?? null, summa: p.summa ?? null,
    kat: p.kat ?? null, narx_usul: null, qoshimcha: null, zamena: null, d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null,
    manba_id: null, versiya: 1, raqam: null, norma: p.norma ?? null,
  };
}
const holat = (qator_id: number, fakt_hajm: number, fakt_summa: number): T2QatorHolat => ({
  id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null,
  fakt_hajm, fakt_summa, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: null, qoldiq_summa: null,
});

const DARAXT = [
  qator({ id: 1, tartib: 1, tur: 'rz', daraja: 0, nom: 'ЗЕМЛЯНЫЕ РАБОТЫ' }),
  qator({ id: 2, tartib: 2, tur: 'bl', daraja: 1, ota_id: 1, kod: 'Е01-01', nom: 'РАЗРАБОТКА ГРУНТА', birlik: 'м3', hajm: 100 }),
  qator({ id: 3, tartib: 3, tur: 'rs', daraja: 2, ota_id: 2, kod: '1-100', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'чел.-ч', hajm: 9.5, narx: 20000, norma: 0.095, kat: 'ЧЕЛ' }),
  qator({ id: 4, tartib: 4, tur: 'rs', daraja: 2, ota_id: 2, kod: '2264', nom: 'ЭКСКАВАТОР', birlik: 'маш.-ч', hajm: 4.7, narx: 50000, norma: 0.047, kat: 'МАШ' }),
  qator({ id: 5, tartib: 5, tur: 'rz', daraja: 0, nom: 'БЕТОННЫЕ РАБОТЫ' }),
  qator({ id: 6, tartib: 6, tur: 'mat', daraja: 1, ota_id: 5, kod: 'С401', nom: 'БЕТОН В25', birlik: 'м3', hajm: 10, narx: null, kat: 'МАТ' }),
];
const HOLAT = [holat(2, 40, 170000), holat(3, 3.8, 76000), holat(4, 1.88, 94000), holat(6, 2, 0)];

// Egasining T1 LRV_PLUS matni (sarlavhalar, ТИП belgilari, ЖАМИ) — H9 istisnosi.
const T1_MATNI = [/^(ҲАЖМ \(ед\)|ҲАЖМ \(жами\)|НАРХ|ЖАМИ|ТИП|Даража|КАЛИТ)$/, /ҳажм$|сумма$/, /^(rz|bl|rs|mat|ob)$/, /^T2-LRV\//];

describe('LRV_PLUS — hujjat standarti', () => {
  for (const rejim of ['toliq', 'forma2'] as const) {
    it(`${rejim}: NULL ≠ 0 — narx noma'lum bargda summa va barcha yuqori jamilar bo'sh; imzo; chop; $ yo'q`, async () => {
      const bytes = await lrvPlusFaylBaytlari(DARAXT, 'Амфитеатр', HOLAT, { rejim, nakrutka: NAKRUTKA_STANDART, imzo: { pudratchi: 'ООО Подрядчик' } });
      namunaSaqla(`lrv_${rejim}.xlsx`, bytes);
      // Excel ochishi uchun: har varaqda <sheetFormatPr> majburiy defaultRowHeight bilan (2026-10-02 regressiyasi).
      const z = unzipSync(bytes);
      for (const [k, v] of Object.entries(z)) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) {
        const sf = strFromU8(v).match(/<sheetFormatPr[^>]*>/)?.[0] ?? '';
        expect(sf, k).toMatch(/defaultRowHeight="[\d.]+"/);
      }
      const t = hujjatTekshir(bytes, { ruxsat: T1_MATNI });
      expect(t.taqiqlangan).toEqual([]);
      expect(t.dollarFormulalar).toEqual([]);
      expect(t.keshsizFormulalar).toEqual([]);
      expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'])).toEqual({ yoq: [], podpis: true });
      expect(t.matnlar.some((m) => m.startsWith('ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ (1)'))).toBe(true);
      const v = t.varaqlar[0];
      expect(v.a4 && v.bittaEnli).toBe(true);
      expect(v.printArea).toMatch(rejim === 'toliq' ? /!\$A\$1:\$W\$\d+$/ : /!\$A\$1:\$P\$\d+$/);
      expect(v.printTitles).toMatch(/\$1:\$3$/);
      // БЕТОН В25 (narxsiz) H katagi va ЖАМИ H3 — bo'sh, 0 emas.
      const h3 = v.kataklar.find((k) => k.ref === 'H3')!;
      expect(h3.v ?? '').toBe('');
      const betonH = v.kataklar.find((k) => k.ref === 'H9')!;
      expect(betonH.f).toBe('IF(OR(F9="",G9=""),"",F9*G9)');
      expect(betonH.v ?? '').toBe('');
      // Ma'lum RZ (ЗЕМЛЯНЫЕ РАБОТЫ) summasi to'liq: 190 000 + 235 000.
      expect(Number(v.kataklar.find((k) => k.ref === 'H4')!.v)).toBe(425000);
    });
  }

  it('regressiya: nakrutka ИТОГО-3 = ИТОГО-2 + ОБ + транспорт + заготовка (ilgari "Прочие" qatoriga havola qilardi)', async () => {
    const bytes = await lrvPlusFaylBaytlari(DARAXT, 'Амфитеатр', HOLAT, { nakrutka: NAKRUTKA_STANDART });
    const k = hujjatTekshir(bytes, { ruxsat: T1_MATNI }).varaqlar[0].kataklar;
    const qatorOf = (matn: string) => Number(k.find((x) => x.matn === matn)!.ref.replace(/^[A-Z]+/, ''));
    const i2 = qatorOf('ИТОГО-2');
    const i3 = qatorOf('ИТОГО-3 (+ ОБ + транспорт/заготовка)');
    expect(k.find((x) => x.ref === `F${i3}`)!.f).toBe(`ROUND(F${i2}+M3+F${i3 - 2}+F${i3 - 1},2)`);
  });

  it('H8: fayl nomi <Obyekt>_<Hujjat>_<sana>', () => {
    expect(lrvPlusFaylNomi('Амфитеатр', 'toliq', '2026-09-25')).toBe('Амфитеатр_LRV_PLUS_2026-09-25.xlsx');
    expect(lrvPlusFaylNomi('Амфитеатр', 'forma2', '2026-09-25')).toBe('Амфитеатр_ФОРМА-2_ЛРВ_2026-09-25.xlsx');
  });

  it('МАНБА (provenance) varag‘i yashirin — chop etilmaydi (H5)', async () => {
    const bytes = await lrvPlusFaylBaytlari(DARAXT, 'Амфитеатр', HOLAT, {}, { kompaniyaId: 1, loyihaId: 1, obyektId: 1, davrId: '2026-09', sourceDocumentId: '7', revisionId: '7:r1', sourceChecksum: 'abc', dataComplete: true });
    const t = hujjatTekshir(bytes, { ruxsat: T1_MATNI });
    expect(t.varaqlar.find((v) => v.nom === 'МАНБА')?.yashirin).toBe(true);
  });
});
