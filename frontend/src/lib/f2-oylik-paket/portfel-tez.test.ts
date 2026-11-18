import { describe, expect, it } from 'vitest';
import type { PortfelAktQator } from '../../api/t2-f2-portfel';
import type { SummaPaket } from '../summa-paket';
import { aktlarYigindisi, jamiFarqi, paketAktiga, paketdanMoliya, portfelBosqich } from './portfel-tez';

const akt = (id: number, holat: PortfelAktQator['holat'], extra: Partial<PortfelAktQator> = {}): PortfelAktQator => ({
  id, obyekt_id: 1, obyekt_nom: 'O1', raqam: String(id), oy: '2026-01-01', sana: null, holat, versiya: 1, lifecycle_status: null, hujjat_jami: 999, forma3_id: null, manba: 'tizim', ...extra,
});
const paket = (q: number, u = q / 1.12, d = q / 1.12): SummaPaket => ({
  qqs_bilan: q, qqs: q - u, ustamali: u, ustamasiz: d, qqs_foiz: 12, ustamasiz_qism: 0,
  kesim: { chel: 0, mash: 0, mat: 0, ob: 0, subpudrat: 0, svod: 0, ustamasiz: 0, nomalum: 0 }, soat: { chel: 0, mash: 0, mashinist: 0 }, subpudratchilar: [], narxsiz_soni: 0, qator_soni: 3,
});

describe('portfel-tez (summa faqat serverdan)', () => {
  it('bosqich server holatidan: bekor/tasdiqlangan/qoralama/rad', () => {
    expect(portfelBosqich(akt(1, 'tasdiqlangan'))).toBe('tasdiqlangan');
    expect(portfelBosqich(akt(2, 'bekor'))).toBe('bekor');
    expect(portfelBosqich(akt(3, 'qoralama'))).toBe('jarayonda');
    expect(portfelBosqich(akt(4, 'qoralama', { lifecycle_status: 'rejected' }))).toBe('rad');
  });
  it('bekor akt hech bir jamiga kirmaydi; summasi noma’lum akt 0 bo‘lib qo‘shilmaydi', () => {
    const aktlar = [akt(1, 'tasdiqlangan'), akt(2, 'tasdiqlangan'), akt(3, 'bekor'), akt(4, 'qoralama')];
    const x = new Map<number, SummaPaket | null>([[1, paket(112)], [2, paket(224)], [3, paket(1000)], [4, null]]);
    const t = aktlarYigindisi(aktlar, x, ['tasdiqlangan']);
    expect(t).toMatchObject({ soni: 2, qqsBilan: 336, nomalum: 0 });
    const h = aktlarYigindisi(aktlar, x, ['tasdiqlangan', 'qoralama']);
    expect(h.soni).toBe(3); expect(h.nomalum).toBe(1); expect(h.qqsBilan).toBe(336);
  });
  it('hujjat_jami zaxirasi YO‘Q: akt summasi serverdan, hujjat_jami e’tiborga olinmaydi', () => {
    const m = paketdanMoliya(paket(112));
    expect(m?.jami).toBe(112);
    expect(m?.ustamasiz).toBeCloseTo(100, 2);
    expect(paketdanMoliya(null)).toBeNull();
    const r = paketAktiga(akt(5, 'tasdiqlangan', { hujjat_jami: 777 }), null);
    expect(r.moliya).toBeNull(); // 777 ga tushmaydi
  });
  it('jamiFarqi: yadro jami bilan aktlar yig‘indisi teng (0), farq bo‘lsa aniq son, to‘liq emas bo‘lsa null', () => {
    const aktlar = [akt(1, 'tasdiqlangan'), akt(2, 'qoralama')];
    const x = new Map<number, SummaPaket | null>([[1, paket(100)], [2, paket(50)]]);
    const y = aktlarYigindisi(aktlar, x, ['tasdiqlangan', 'qoralama']);
    expect(jamiFarqi(paket(150), y)).toBe(0);
    expect(jamiFarqi(paket(160), y)).toBe(10);
    expect(jamiFarqi(paket(150), aktlarYigindisi(aktlar, new Map([[1, paket(100)]]), ['tasdiqlangan', 'qoralama']))).toBeNull();
    expect(jamiFarqi(null, y)).toBeNull();
  });
});
