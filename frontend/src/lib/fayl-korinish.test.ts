import { describe, expect, it } from 'vitest';
import { faylTurTaqsimot, faylTuri } from './fayl-korinish';

describe('fayl turi', () => {
  it('mime va kengaytmadan', () => {
    expect(faylTuri({ mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nom: 'a' })).toBe('excel');
    expect(faylTuri({ mime: '', nom: 'F2.XLSX' })).toBe('excel');
    expect(faylTuri({ mime: 'application/pdf', nom: 'x' })).toBe('pdf');
    expect(faylTuri({ mime: 'image/jpeg', nom: 'x' })).toBe('rasm');
    expect(faylTuri({ mime: 'application/msword', nom: 'x' })).toBe('word');
    expect(faylTuri({ mime: '', nom: 'a.zip' })).toBe('arxiv');
    expect(faylTuri({ mime: 'text/plain', nom: 'a.txt' })).toBe('boshqa');
  });
  it('hajm bo‘yicha taqsimot, kattasi birinchi; bo‘sh ro‘yxat — 0', () => {
    const r = faylTurTaqsimot([{ nom: 'a.pdf', hajm: 300 }, { nom: 'b.xlsx', hajm: 100 }, { nom: 'c.pdf', hajm: 100 }]);
    expect(r.qismlar.map((q) => [q.tur, q.soni, q.hajm, q.ulush])).toEqual([['pdf', 2, 400, 0.8], ['excel', 1, 100, 0.2]]);
    expect(faylTurTaqsimot([])).toEqual({ qismlar: [], jamiHajm: 0, soni: 0 });
  });
});
