import { describe, expect, it } from 'vitest';
import type { XotiraNomzod } from './moslash';
import { qatorlarniOqi } from './parse';
import { miqdorBoshlang, nomzodHajmi } from './tanlash';

const nz = (o: Partial<XotiraNomzod>): XotiraNomzod => ({ qatorId: 1, ball: 90, tur: 'bl', kod: null, nom: 'X', birlik: '100М3', yol: '', smetaHajm: 40, faktHajm: 10, f2Hajm: 0, qoldiq: 30, narx: null, birlikMos: true, miqdor: 1.2, sigadi: true, ...o });

describe('miqdor maydoni', () => {
  it('boshlang‘ich matn: son / % / hammasi', () => {
    const [a, b, c, d] = qatorlarniOqi('beton 120 m3\npoydevor 50%\narmatura hammasi\nnoma');
    expect([a, b, c, d].map(miqdorBoshlang)).toEqual(['120', '50%', 'hammasi', '']);
  });
  it('son: so‘rov birligidan smeta birligiga nisbat saqlanadi (120 m3 → 1.2; 60 → 0.6)', () => {
    const [q] = qatorlarniOqi('beton 120 m3');
    expect(nomzodHajmi(q, nz({}), '120')).toBe(1.2);
    expect(nomzodHajmi(q, nz({}), '60')).toBe(0.6);
  });
  it('foiz va hammasi qoldiqdan; so‘rovda son yo‘q bo‘lsa son smeta birligida', () => {
    const [f, h, y] = qatorlarniOqi('a 50%\nb hammasi\nc');
    expect(nomzodHajmi(f, nz({}), '50%')).toBe(15);
    expect(nomzodHajmi(h, nz({}), 'hammasi')).toBe(30);
    expect(nomzodHajmi(y, nz({ miqdor: null }), '7')).toBe(7);
    expect(nomzodHajmi(y, nz({}), '')).toBeNull();
  });
});
