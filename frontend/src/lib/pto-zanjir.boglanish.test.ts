import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import type { F2Tafsilot } from '../api/t2-narx';
import type { F2HujjatKonteksti } from '../api/f2-hujjat-kontekst';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { bahoMoliya, f2AktBaho, f2AktTayyorla } from './f2-akt-eksport';
import { f2Hujjat } from './f2-hujjat';
import { hujjatTekshir } from './hujjat-yozuvchi';
import { oyAktlarBahosi, type PortfelObyektKirish } from './f2-oylik-paket/portfel';
import { avtoForma3, minimalSvod, AVTO_F3_ID } from './f2-oylik-paket/forma3-avto';
import { oyJami, type PaketAkt } from './f2-oylik-paket/oylik';
import { f3SotuvdanHisobla, shartnomaSvodi, sverkaHisobla, tiyin, type SvodShartnoma } from './nakopitelniy-svod';
import { nakopitelniyVedomostHujjat } from './nakopitelniy-vedomost-export';
import { yaxlit2 } from './hisob-yadro';
import type { ReestrAkt } from './f2-reestr/reestr';

/**
 * PTO ZANJIRI BO'G'INLARI ARO BOG'LANISH (egasi 2026-11-14): F-2 akt → (summa) → F-3 → akt-sverka → nakopitelniy.
 * Har bo'g'in o'zidan oldingisining natijasini AYNAN (tiyingacha) olishi shart; ikkinchi akt O'Z podvali bilan.
 * Barcha raqamlar SINTETIK.
 */
const NK = { 'ТРАНСПОРТ_МАТЕРИАЛ': 0, 'СКЛАДСКИЕ_МАТЕРИАЛ': 0, 'СКЛАДСКИЕ_МК': 0, 'ТРАНСПОРТ_КАБЕЛЬ': 0, 'ПРОЧИЕ_ПОДРЯДЧИК': 18, 'ТРАНСПОРТ_ОБОРУД': 0, 'ЗАГОТ_СКЛАД_ОБОРУД': 0, 'СТРАХОВАНИЕ': 0, 'РИСК': 0, 'НДС': 12 };
const NK2 = { ...NK, 'ПРОЧИЕ_ПОДРЯДЧИК': 20 };
const CTX: F2HujjatKonteksti = { imzo: {}, shartnoma: null, nakrutka: NK, podval: null, svodYaxlit: null };

const r = (id: number, ota: number | null, tur: string, nom: string, kat: string | null, hajm: number | null, narx: number | null, tartib: number) => ({
  id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: ota, daraja: null, tartib, tur, kod: null, nom, birlik: tur === 'rz' ? null : 'шт', hajm, narx, summa: null, kat,
  narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null,
}) as unknown as T2Qator;
const SMETA: T2Qator[] = [
  r(10, null, 'rz', 'РАЗДЕЛ', null, null, null, 1),
  r(11, 10, 'mat', 'МАТЕРИАЛ', 'МАТ', 100, 1000, 2),
  r(12, 10, 'mat', 'ТРУД', 'ЧЕЛ', 100, 500, 3),
];

let lid = 0;
const line = (aktId: number, oy: string, raqam: string, qid: number, hajm: number): F2Tafsilot => {
  const q = SMETA.find((x) => x.id === qid)!;
  const narx = q.narx as number;
  const summa = Math.round(hajm * narx * 100) / 100;
  return { akt_id: aktId, obyekt_id: 1, kompaniya_id: 1, tur: 'f2', oy, akt_holat: 'tasdiqlangan', raqam, akt_kim: null, akt_sana: oy, akt_qator_id: ++lid, qator_id: qid,
    kod: null, nom: q.nom, birlik: q.birlik, kat: q.kat, qator_tur: q.tur, hajm, narx, summa, izoh: null, certified_quantity: hajm, certified_unit_price: narx, certified_amount: summa } as F2Tafsilot;
};

// A1 — fevral (obyekt podvali), A2 — mart (O'Z podvali: PROCHIE 20 %).
const AKTLAR = [
  { id: 1, oy: '2026-02-01', raqam: '1', lines: [line(1, '2026-02-01', '1', 11, 10)], hujjat_jami: 10_000 },
  { id: 2, oy: '2026-03-01', raqam: '2', lines: [line(2, '2026-03-01', '2', 11, 20), line(2, '2026-03-01', '2', 12, 40)], hujjat_jami: 40_000 },
];
const PODVAL = new Map([['2:', { nk: NK2 }]]) as unknown as PortfelObyektKirish['podvallar'];
const MODEL: PortfelObyektKirish = { smeta: SMETA, kontekst: CTX, podvallar: PODVAL, tafsilot: AKTLAR.flatMap((a) => a.lines), aktQatorlar: new Map() };
const raqamlar = new Map(AKTLAR.map((a) => [a.id, a.raqam] as const));

const tayyor = (a: typeof AKTLAR[number]) => f2AktTayyorla({ smeta: SMETA, lines: a.lines, aktQatorlar: [], podvallar: PODVAL, kontekst: CTX, akt: { id: a.id, oy: a.oy, raqam: a.raqam, holat: 'tasdiqlangan' }, obyektNom: 'T', raqamlar })!;
const baho = (a: typeof AKTLAR[number]) => f2AktBaho(tayyor(a), CTX);

const reestrAkt = (a: typeof AKTLAR[number]): ReestrAkt => ({ id: a.id, obyekt_id: 1, oy: a.oy, raqam: a.raqam, holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: a.hujjat_jami, farq: 0, qator_soni: a.lines.length, narxsiz_qator: 0, manba: 'tizim' });
const paketAkt = (a: typeof AKTLAR[number]): PaketAkt => ({ akt: reestrAkt(a), obyektNom: 'T', loyiha: null, bosqich: 'tasdiqlangan', moliya: bahoMoliya(baho(a), a.hujjat_jami), moliyaXato: false, uchastkalar: null });

describe('PTO zanjiri: F-2 → F-3 → akt-sverka → nakopitelniy', () => {
  it('F-2: har aktning ustamasiz jami = hujjat jami; QQS bilan = o\'z podvali bilan hisob', () => {
    expect(baho(AKTLAR[0]).ustamasiz).toBe(10_000);
    expect(baho(AKTLAR[1]).ustamasiz).toBe(40_000);
    // A1: obyekt podvali (18 %): 10 000 × 1,18 × 1,12; A2: o'z podvali (20 %): 40 000 × 1,20 × 1,12
    expect(baho(AKTLAR[0]).qqsBilan).toBe(yaxlit2(10_000 * 1.18 * 1.12));
    expect(baho(AKTLAR[1]).qqsBilan).toBe(yaxlit2(40_000 * 1.2 * 1.12));
  });

  it('F-2 Excel: katakdagi ВСЕГО = yadro bahosi (0,00 farq), jami = hujjat jami', () => {
    for (const a of AKTLAR) {
      const t = tayyor(a);
      const h = f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya);
      expect(h.jami).toBe(a.hujjat_jami);
      const sonlar = hujjatTekshir(h.bytes).varaqlar[0].kataklar.map((k) => Number(k.v)).filter((x) => Number.isFinite(x));
      expect(sonlar).toContain(baho(a).qqsBilan);
    }
  });

  it('F-3 (avto) = oyning tasdiqlangan F-2 lari QQS bilan jami; aktning o\'z podvali ishlaydi', () => {
    const rows = AKTLAR.map(paketAkt);
    const sh = minimalSvod({ id: 1, raqam: '1', nom: null, jami_nds_bilan: 1_000_000, summa_bez_nds: null } as never, [{ id: 1, nom: 'T' }]);
    const a = avtoForma3({ sh, oy: '2026-03', rows, tanlov: 'toliq', tashkilot: 'P', imzo: { zakazchik: 'Z' } })!;
    expect(a.summa).toBe(baho(AKTLAR[1]).qqsBilan);
    expect(a.summa).toBe(oyJami(rows.filter((x) => x.akt.oy.startsWith('2026-03'))).jami.malum);
  });

  it('F-3 oy/«с начала» (oyAktlarBahosi) = har akt o\'z podvali; yig\'indi = aktlar ВСЕГО', () => {
    const b = oyAktlarBahosi(MODEL, AKTLAR.map((a) => ({ id: a.id, oy: a.oy, raqam: a.raqam })), 'T', raqamlar);
    expect(b.map((x) => x.qqsBilan)).toEqual(AKTLAR.map((a) => baho(a).qqsBilan));
    expect(b.find((x) => x.aktId === 2)!.hujjatPodvali).toBe(true);
  });

  it('F-3 → akt-sverka: sotuv summasi = F-3 summasi, qoldiq = F-3 − to\'lov (tiyingacha), F-3 hujjati davri shu summaga teng', () => {
    const rows = AKTLAR.map(paketAkt);
    const f3 = avtoForma3({ sh: minimalSvod({ id: 1, raqam: '1', nom: null, jami_nds_bilan: 1_000_000, summa_bez_nds: null } as never, [{ id: 1, nom: 'T' }]), oy: '2026-03', rows, tanlov: 'toliq' })!;
    const sh: SvodShartnoma = {
      ...minimalSvod({ id: 1, raqam: '1', nom: null, jami_nds_bilan: 1_000_000, summa_bez_nds: null } as never, [{ id: 1, nom: 'T' }]),
      f2: AKTLAR.map((a) => ({ akt_id: a.id, obyekt_id: 1, oy: a.oy, raqam: a.raqam, hujjat_jami: a.hujjat_jami })),
      f3: [{ id: 5, manba: 'sotuv', raqam: '1', sotuv_sana: '2026-03-31', sotuv_summa: f3.summa, nds_foiz: 12, davr_boshi: '2026-03-01', davr_oxiri: '2026-03-31', holat: 'tayyor', bajarilgan_f2_summa: f3.summa, izoh: null, versiya: 1 }],
      tolovlar: [{ id: 1, sana: '2026-04-05', summa: 10_000, tur: 'tolov', izoh: null }],
    };
    const sv = shartnomaSvodi(sh);
    expect(sv.f3).toBe(tiyin(f3.summa));
    expect(sv.f2).toBe(tiyin(50_000));
    expect(sv.qoldiq).toBe(tiyin(f3.summa) - tiyin(10_000));
    const s = sverkaHisobla(sh);
    expect(s.yakuniy).toBe(sv.qoldiq);
    expect(s.tenglik).toBe(true);
    expect(f3SotuvdanHisobla(sh, 5)!.davr[2]).toBe(tiyin(f3.summa));
    expect(AVTO_F3_ID).toBeLessThan(0);
  });

  it('nakopitelniy: «К ОПЛАТЕ» oy va с начала = aktlar (har biri o\'z podvali) ВСЕГО; qator hisobi (obyekt podvali) farq qilsa — замечание', () => {
    const nq = (p: Partial<NakopitelniyQator> & { tur: NakopitelniyQator['tur'] }): NakopitelniyQator => ({
      qator_id: 0, tartib: 0, kod: null, nom: null, birlik: null, kat: null, qoshimcha: false, zamena: false, smeta_hajm: null, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0,
      oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0, jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
      jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
    });
    // MAT 11: A1 10 + A2 20 = 30 dona × 1000; ЧЕЛ 12: A2 40 dona × 500. Mart = joriy, fevral = oldingi.
    const qatorlar = [
      nq({ qator_id: 10, tartib: 1, tur: 'rz', nom: 'РАЗДЕЛ', smeta_summa: 200_000 }),
      nq({ qator_id: 11, tartib: 2, tur: 'mat', kat: 'МАТ', nom: 'МАТЕРИАЛ', birlik: 'шт', smeta_hajm: 100, smeta_narx: 1000, smeta_summa: 100_000, fakt_hajm: 30, oldingi_hajm: 10, oldingi_summa: 10_000, joriy_hajm: 20, joriy_summa: 20_000, jami_hajm: 30, jami_summa: 30_000, qoldiq_hajm: 70, qoldiq_summa: 70_000 }),
      nq({ qator_id: 12, tartib: 3, tur: 'mat', kat: 'ЧЕЛ', nom: 'ТРУД', birlik: 'шт', smeta_hajm: 100, smeta_narx: 500, smeta_summa: 50_000, fakt_hajm: 40, joriy_hajm: 40, joriy_summa: 20_000, jami_hajm: 40, jami_summa: 20_000, qoldiq_hajm: 60, qoldiq_summa: 30_000 }),
    ];
    const b = oyAktlarBahosi(MODEL, AKTLAR.map((a) => ({ id: a.id, oy: a.oy, raqam: a.raqam })), 'T', raqamlar).map((x) => ({ ...x, oy: AKTLAR.find((a) => a.id === x.aktId)!.oy.slice(0, 7) }));
    const res = nakopitelniyVedomostHujjat(qatorlar, { obyektNom: 'T', davr: '2026-03', ndsFoiz: 12, nakrutka: NK, aktlarKOplate: b });
    expect(res.kOplata.davr).toBe(baho(AKTLAR[1]).qqsBilan);
    expect(res.kOplata.jami).toBe(yaxlit2((baho(AKTLAR[0]).qqsBilan as number) + (baho(AKTLAR[1]).qqsBilan as number)));
  });
});
