import { describe, expect, it } from 'vitest';
import { sbT2TreeQur, type T2Qator, type T2QatorHolat } from './supabase';

describe('kanonik LRV daraxti', () => {
  it('tasdiqlangan F2 va Fakt–F2 mumkin qiymatini qator holatidan saqlaydi', () => {
    const qator = {
      id: 101, obyekt_id: 7, kompaniya_id: 3, ota_id: null, daraja: 0, tartib: 1,
      tur: 'bl', kod: '01', nom: 'Beton', birlik: 'm3', hajm: 100, narx: 50,
      summa: 5000, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
      d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null,
      manba_id: null, versiya: 1, raqam: null, norma: null, obyekt: 'Amfiteatr',
    } as T2Qator;
    const holat = {
      id: 1, qator_id: 101, obyekt_id: 7, tur: 'bl', kod: '01', nom: 'Beton',
      birlik: 'm3', kat: null, smeta_hajm: 100, smeta_summa: 5000,
      fakt_hajm: 60, fakt_summa: 3000, f2_hajm: 25, f2_summa: 1249.99,
      qoldiq_hajm: 40, qoldiq_summa: 2000, f2_mumkin_hajm: 35,
      f2_mumkin_summa: 1750, f2_narx: 50, fakt_narx: 50,
      f2_narx_farq_foiz: 0,
    } as T2QatorHolat;

    const [node] = sbT2TreeQur([qator], [holat]);

    expect(node).toMatchObject({
      id: 101,
      fakt: 60,
      qoldiq: 40,
      faktHajm: 60,
      f2ol: 25,
      f2mum: 35,
      stFakt: 3000,
      stF2: 1249.99,
      stOst: 2000,
      stF2Mum: 1750,
    });
  });

  /* Owner (2026-09-10): "hali f2 kiritilmaganku nima uchun smeta summasi
   * bilan bir xil turibdi? ostatka summada smeta summasi turishi kerak edi".
   * Daraxtdagi "Ost. Sum" va "F2 M. Sum" ustunlari almashib ketgan edi:
   * qoldiq (stOst) "F2 mumkin" sarlavhasi ostida, "Qoldiq" ostida esa
   * smeta-qoldiq (ya'ni OLINGAN summa) chiqardi. Hech narsa qilinmagan
   * obyektda bu "qoldiq = 0" degan teskari ma'no berardi. */
  it('hech narsa bajarilmaganda qoldiq = smeta, F2 mumkin = 0 bo\'ladi', () => {
    const qator = {
      id: 303, obyekt_id: 71, kompaniya_id: 17, ota_id: null, daraja: 0, tartib: 1,
      tur: 'rz', kod: null, nom: 'ЗЕМЛЯНЫЕ РАБОТЫ', birlik: null, hajm: null, narx: null,
      summa: 81599734.26, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
      d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null,
      manba_id: null, versiya: 1, raqam: null, norma: null, obyekt: 'Stella',
    } as T2Qator;
    const holat = {
      id: 3, qator_id: 303, obyekt_id: 71, tur: 'rz', kod: null, nom: 'ЗЕМЛЯНЫЕ РАБОТЫ',
      birlik: null, kat: null, smeta_hajm: null, smeta_summa: 81599734.26,
      fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0,
      qoldiq_hajm: null, qoldiq_summa: 81599734.26,
      f2_mumkin_hajm: 0, f2_mumkin_summa: 0,
      f2_narx: null, fakt_narx: null, f2_narx_farq_foiz: null,
    } as T2QatorHolat;

    const [node] = sbT2TreeQur([qator], [holat]);

    expect(node.stOst).toBe(81599734.26);
    expect(node.stF2Mum).toBe(0);
    expect(node.stFakt).toBe(0);
    expect(node.stF2).toBe(0);
  });

  it('manba qiymati yo‘q bo‘lsa uni nolga aylantirmaydi', () => {
    const qator = {
      id: 202, obyekt_id: 8, kompaniya_id: 3, ota_id: null, daraja: 0, tartib: 1,
      tur: 'rz', kod: null, nom: 'Noma’lum smeta', birlik: null, hajm: null, narx: null,
      summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
      d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null,
      manba_id: null, versiya: 1, raqam: null, norma: null, obyekt: 'Sinov',
    } as T2Qator;
    const holat = {
      id: 2, qator_id: 202, obyekt_id: 8, tur: 'rz', kod: null, nom: 'Noma’lum smeta',
      birlik: null, kat: null, smeta_hajm: null, smeta_summa: null,
      fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0,
      qoldiq_hajm: null, qoldiq_summa: null, f2_mumkin_hajm: 0,
      f2_narx: null, fakt_narx: null,
      f2_narx_farq_foiz: null,
    } as T2QatorHolat;

    const [node] = sbT2TreeQur([qator], [holat]);

    expect(node.id).toBe(202);
    expect(node.smetaHajm).toBeNull();
    expect(node.smeta).toBeNull();
    expect(node.narx).toBeNull();
    expect(node.qoldiq).toBeNull();
    expect(node.qoldiqSumma).toBeNull();
  });

  it('ichma-ich RZ: ota RZ smetasi bola RZ lar bilan yig‘iladi; null 0 ga aylanmaydi (SMETA_ANATOMIYA_V1)', () => {
    const q = (id: number, ota_id: number | null, tur: string, summa: number | null) => ({
      id, obyekt_id: 7, kompaniya_id: 3, ota_id, daraja: 0, tartib: id, tur, kod: null, nom: 'q' + id, birlik: null,
      hajm: null, narx: null, summa, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
      d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, obyekt: 'X',
    }) as T2Qator;
    // ОЗЕРА(rz, o'z ishlari yo'q) → КАНАЛ(rz, 100) → КЖ(rz, 50); bo'sh(rz, null)
    const [ozera, bosh] = sbT2TreeQur([
      q(1, null, 'rz', null), q(2, 1, 'rz', 100), q(3, 2, 'rz', 50),
      q(4, 2, 'bl', 100), q(5, 3, 'bl', 50), q(6, null, 'rz', null),
    ]);
    expect(ozera.smeta).toBe(150);
    expect(ozera.children![0].smeta).toBe(150);
    expect(ozera.children![0].children!.find((n) => n.type === 'rz')!.smeta).toBe(50);
    expect(ozera.children![0].children!.find((n) => n.type === 'bl')!.smeta).toBe(100);
    expect(bosh.smeta).toBeNull();
  });
});

describe('F2 / Fakt pul qiymatlari ichma-ich yig‘iladi (egasi 2026-09-30, Yevropa oshxonasi)', () => {
  const q = (id: number, ota_id: number | null, tur: string) => ({
    id, obyekt_id: 82, kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: null, nom: 'n' + id, birlik: null,
    hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, obyekt: 'Y',
  }) as T2Qator;
  const h = (qator_id: number, f2_summa: number, fakt_summa = 0) => ({
    id: qator_id, qator_id, obyekt_id: 82, tur: 'rs', kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null,
    fakt_hajm: 0, fakt_summa, f2_hajm: 0, f2_summa, qoldiq_hajm: null, qoldiq_summa: null, f2_mumkin_hajm: 0, f2_mumkin_summa: 0,
    f2_narx: null, fakt_narx: null, f2_narx_farq_foiz: null,
  }) as T2QatorHolat;
  it('rz → rz → bl → rs: bo‘lim va ishda barglar yig‘indisi', () => {
    const [rz] = sbT2TreeQur([q(1, null, 'rz'), q(2, 1, 'rz'), q(3, 2, 'bl'), q(4, 3, 'rs'), q(5, 3, 'rs'), q(6, 2, 'mat')],
      [h(1, 0), h(2, 0), h(3, 0), h(4, 100, 40), h(5, 50), h(6, 7)]);
    expect(rz.stF2).toBe(157);
    expect(rz.stFakt).toBe(40);
    expect(rz.children![0].children![0].stF2).toBe(150);
  });
});
