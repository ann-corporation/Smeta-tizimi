/**
 * USTAMA_BIR_XIL_V1 (2026-11-14 audit): bo'lim jami (MCP obyekt_holat, AI buyruq, ekran) svod yaxlit bilan hisoblanadi —
 * svod bo'limiga ustama QO'SHILMAYDI (SQL `_t2_summa_agg_v1` bilan bir xil); ЧЕЛ/МАШ qismi F2 da oddiy kategoriya.
 * Sintetik ma'lumot (real summa yo'q).
 */
import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { bolimSummalari } from './fakt-jurnal';
import type { SvodYaxlit } from './svod-yaxlit';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'сум',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

// 1: oddiy bo'lim (МАТ 1000). 10: svod bo'lim — ОБ 5000 (yaxlit) va ЧЕЛ 2000 (pudratchi mehnati).
const r = [
  q({ id: 1, tur: 'rz', nom: 'ODDIY' }), q({ id: 2, tur: 'bl', ota_id: 1, hajm: 1 }), q({ id: 3, tur: 'mat', ota_id: 2, kat: 'МАТ' }),
  q({ id: 10, tur: 'rz', nom: 'SVOD' }), q({ id: 11, tur: 'ob', ota_id: 10, kat: 'ОБ' }), q({ id: 12, tur: 'rs', ota_id: 10, kat: 'ЧЕЛ' }),
];
const h = [
  { qator_id: 3, smeta_hajm: 1, fakt_hajm: 0, smeta_summa: 1000, f2_summa: 1000, fakt_summa: 0, qoldiq_summa: 0 },
  { qator_id: 11, smeta_hajm: 1, fakt_hajm: 0, smeta_summa: 5000, f2_summa: 5000, fakt_summa: 0, qoldiq_summa: 0 },
  { qator_id: 12, smeta_hajm: 1, fakt_hajm: 0, smeta_summa: 2000, f2_summa: 2000, fakt_summa: 0, qoldiq_summa: 0 },
];
const svod: SvodYaxlit = {
  qqssiz: 7000, barglar: 7000, summasiz: 0,
  bolimlar: [{ id: 1, qator_id: 10, nom: 'SVOD', svod_summa: 7840, qqs_stavka: 12, qqssiz: 7000, barglar: 7000, asos: 'svod', dalil: {} }],
};

describe('bolimSummalari + svod yaxlit (UI/MCP/AI bir xil jami)', () => {
  it('svod berilmasa ОБ oddiy kategoriya (ustama hisoblanadi) — eski xatti-harakat', () => {
    const s = bolimSummalari(r, h);
    expect(s.get(10)?.f2.kesim.summalar.ОБ).toBe(5000);
    expect(s.get(10)?.f2.kesim.yaxlit).toBeUndefined();
  });

  it('svod berilsa: F2 da ОБ (yaxlit) kategoriyadan chiqadi, ЧЕЛ esa oddiy kategoriya bo\'lib qoladi', () => {
    const s = bolimSummalari(r, h, undefined, svod);
    const k = s.get(10)!.f2.kesim;
    expect(k.summalar.ОБ).toBeUndefined();            // ОБ ga ustama qo'shilmaydi
    expect(k.summalar.ЧЕЛ).toBe(2000);                // F2 da pudratchi mehnati — smeta podvali ustamasi bilan
    expect(k.yaxlit).toBeDefined();                    // yaxlit qism alohida
    expect(s.get(1)!.f2.kesim.summalar.МАТ).toBe(1000); // oddiy bo'lim o'zgarmaydi
  });
});

