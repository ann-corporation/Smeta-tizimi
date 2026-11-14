import { describe, expect, it } from 'vitest';
import { pereraschetBolimlari, type PQator } from './pereraschet';
import { pereraschetXlsx } from './pereraschet-export';
import { pereraschetYagona } from './pereraschet-yagona';
import type { T2Qator, T2QatorHolat } from '../api/supabase';

/* Hisob testlari — `pereraschet-yagona.test.ts` (slichitelniy modeli). Bu yerda: razdel ro'yxati va Excel. */
const Q = (id: number, ota: number | null, tur: string): PQator => ({
  qator_id: id, ota_id: ota, tur, kod: `K${id}`, nom: `Qator ${id}`, birlik: 'м3', kat: null,
  smeta_hajm: 10, smeta_narx: 1000, fakt_hajm: 0, f2_hajm: 0, f2_summa: 0, f2_summa_nomalum: 0, almashtirilgan_hajm: 0, fakt_manbasi: 'DIRECT',
});

describe('pereraschet razdellari va Excel', () => {
  it('razdellar ro‘yxati: faqat ostida barg bor razdellar, daraxt tartibida', () => {
    const rows = [Q(1, null, 'rz'), Q(2, 1, 'rz'), Q(3, 2, 'mat'), Q(4, null, 'rz'), Q(5, 4, 'bl'), Q(6, null, 'rz'), Q(7, 6, 'rs')];
    expect(pereraschetBolimlari(rows).map((b) => [b.id, b.daraja])).toEqual([[1, 0], [2, 1], [6, 0]]);
  });

  it('Excel: yagona hisobdan yasaladi, formulalar bor (token sanog‘i)', () => {
    const q = (id: number, ota: number | null, tur: string, hajm: number | null): T2Qator => ({ id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id: ota, daraja: 0, tartib: id, tur, kod: 'K' + id, nom: 'Q' + id, birlik: 'м3', hajm, narx: 1000, summa: null,
      kat: tur === 'rz' ? null : 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null }) as T2Qator;
    const h = (id: number, fakt: number, f2h: number, f2s: number): T2QatorHolat => ({ id, qator_id: id, obyekt_id: 1, fakt_hajm: fakt, fakt_summa: 0, f2_hajm: f2h, f2_summa: f2s }) as unknown as T2QatorHolat;
    const n = pereraschetYagona([q(1, null, 'rz', null), q(2, 1, 'mat', 10), q(3, 1, 'mat', 10)], [h(2, 8, 5, 5000), h(3, 0, 2, 2000)]);
    const x = pereraschetXlsx(n, { obyektNomi: 'Sinov', ndsFoiz: 12, ustamali: { plus: 5000, minus: 2500 }, sana: '2026-10-25' });
    expect(x.bytes.length).toBeGreaterThan(1000);
    expect(x.yacheykalar).toBeGreaterThan(5);
    expect(x.faylNomi).toMatch(/ПЕРЕРАСЧЁТ/);
  });
});