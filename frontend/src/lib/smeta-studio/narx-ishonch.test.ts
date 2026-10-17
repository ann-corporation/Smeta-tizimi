import { describe, expect, it } from 'vitest';
import type { KatalogQatori } from '../narx-katalog/types';
import { ishonchniKuchaytir, manbaKaliti, resursKaliti } from './narx-ishonch';
import type { NarxNomzod } from './narx-yigish';

const row = { id: 1, manba_id: 1, kod: '1', nom: 'Арматура А500С Д10', birlik: 'т', narx: 8_000_000, hudud: null, ishlab_chiqaruvchi: null, nds_holati: null,
  nds_izoh: null, yil: 2026, kvartal: 3, narx_varianti: null, guruh: null, hudud_kalit: null, manba_nom: 'Каталог', manba_tur: 'katalog' } as KatalogQatori;
const n = (tur: NarxNomzod['tur'] = 'katalog'): NarxNomzod => ({ id: 'k1', nom: row.nom, birlik: 'т', narx: 8_000_000, manba: 'katalog', tur, row, qayta: null });
const mk = manbaKaliti(n());

describe('narx ishonchini kuchaytirish (egasi 2026-10-17: to‘g‘ri topganini so‘ramasin)', () => {
  it('kalitlar t2_qator nom_key|birlik_key bilan bir xil', () => {
    expect(resursKaliti('Арматура А-500С, д.10', 'т.')).toBe('АРМАТУРАА500СД10|Т');
    expect(mk).toBe('АРМАТУРАА500СД10|Т');
  });
  it('smetachilar 2+ marta tasdiqlagan manba → o‘rta yuqoriga ko‘tariladi', () => {
    const r = ishonchniKuchaytir(n(), 'orta', { tanlovlar: [{ manba: mk, qabul: 3, rad: 0, kompaniya_soni: 2 }] });
    expect(r.ishonch).toBe('yuqori');
    expect(r.dalil).toContain('3 marta tasdiqlagan');
  });
  it('yuklangan smetalar amaliyotiga mos narx → yuqori', () => {
    expect(ishonchniKuchaytir(n(), 'orta', { kuzatuv: 40, kompaniya_soni: 3, mos: true }).ishonch).toBe('yuqori');
  });
  it('rad etilgan manba yoki amaliyotdan keskin farq → yuqori ham so‘raladi', () => {
    expect(ishonchniKuchaytir(n(), 'yuqori', { tanlovlar: [{ manba: mk, qabul: 1, rad: 3, kompaniya_soni: 2 }] }).ishonch).toBe('orta');
    expect(ishonchniKuchaytir(n(), 'yuqori', { kuzatuv: 25, kompaniya_soni: 2, mos: false }).ishonch).toBe('orta');
    // kam kuzatuv — farq hukm emas
    expect(ishonchniKuchaytir(n(), 'yuqori', { kuzatuv: 6, kompaniya_soni: 2, mos: false }).ishonch).toBe('yuqori');
  });
  it('dalil yo‘q, past ishonch yoki kompaniya smetasi — o‘zgarmaydi', () => {
    expect(ishonchniKuchaytir(n(), 'orta', {}).ishonch).toBe('orta');
    expect(ishonchniKuchaytir(n(), 'past', { kuzatuv: 40, kompaniya_soni: 3, mos: true }).ishonch).toBe('past');
    expect(ishonchniKuchaytir(n('kompaniya'), 'orta', { kuzatuv: 40, kompaniya_soni: 3, mos: true }).ishonch).toBe('orta');
    expect(ishonchniKuchaytir(n(), 'orta', { tanlovlar: [{ manba: mk, qabul: 2, rad: 1, kompaniya_soni: 1 }] }).ishonch).toBe('orta');
  });
});
