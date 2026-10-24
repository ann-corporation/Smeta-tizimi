import { describe, expect, it } from 'vitest';
import type { BirjaTaklif } from '../../api/t2-birja';
import { birjaQatori } from './birja-moslash';
import { qatorniTaqqosla } from './taqqoslash';

const tk = (id: number, kompaniya_id: number, narx: number): BirjaTaklif => ({ id, rfq_id: 1, kompaniya_id, narx, izoh: null, holat: 'yangi', kim: null, yaratilgan_vaqt: '2026-01-01' });
describe('birjaQatori', () => {
  it('RFQ + takliflar -> taqqoslash; bir kompaniya qayta bersa oxirgisi', () => {
    const q = birjaQatori({ id: 1, nom: 'Sement', birlik: 'tonna', hajm: 10 }, [tk(3, 7, 90), tk(1, 7, 100), tk(2, 8, 120)]);
    const r = qatorniTaqqosla(q);
    expect(r.narxliSoni).toBe(2); expect(r.ortacha).toBe(105); expect(r.eng?.yetkazuvchiId).toBe(7);
  });
});
