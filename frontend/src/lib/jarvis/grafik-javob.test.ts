import { describe, expect, it } from 'vitest';
import { jarvisGrafikJavobi } from './answers';
import type { AiUmumiy } from '../../api/t2-ai';

const data = { ok: true, obyektlar: [{ id: 7, nom: 'Sinov bog', smeta: 1, fakt: 1, f2: 1, narxsiz: 0, toliq: true }, { id: 8, nom: 'Boshqa', smeta: 1, fakt: 1, f2: 1, narxsiz: 0, toliq: true }] } as unknown as AiUmumiy;

describe('jarvisGrafikJavobi', () => {
  it('grafik savoli: aniq obyektga havola, raqamsiz', () => {
    const j = jarvisGrafikJavobi('Sinov bog grafigi qanday?', data);
    expect(j).toContain('/admin/grafik?obyekt=7');
    expect(j).not.toMatch(/\d{4,}/);
  });
  it('pul oqimi: tab=pul', () => {
    expect(jarvisGrafikJavobi('Sinov bog pul oqimi prognozi', data)).toContain('/admin/grafik?obyekt=7&tab=pul');
  });
  it('obyekt aytilmasa umumiy sahifa; aloqasiz savol null', () => {
    expect(jarvisGrafikJavobi('kechikayotgan ishlar', data)).toContain('(/admin/grafik)');
    expect(jarvisGrafikJavobi('Sinov bog F2 jami qancha', data)).toBeNull();
  });
});
