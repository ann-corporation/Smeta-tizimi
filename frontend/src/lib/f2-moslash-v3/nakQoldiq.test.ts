import { describe, expect, it } from 'vitest';
import { nakQoldiqXaritalari, type NakQator } from './nakQoldiq';

const tartibla = (m: Map<number, number>) => [...m.entries()].sort((a, b) => a[0] - b[0]);

describe('nakQoldiqXaritalari — faqat faol Nakopitelniy + smetadan to‘ldirish', () => {
  // Sintetik smeta: 3000 qator, ba'zilarida hajm yo'q; ba'zilarida tasdiqlangan F2 bor (manfiy pereraschet ham).
  const smeta = Array.from({ length: 3000 }, (_, i) => ({ id: 1000 + i, hajm: i % 17 === 0 ? null : (i % 9) + 0.25 }));
  const toliq: NakQator[] = smeta.map((s, i) => {
    const oldingi = i % 11 === 0 ? 1.5 : i % 13 === 0 ? -0.5 : 0;
    const joriy = i % 23 === 0 ? 0.75 : 0;
    return { qator_id: s.id, oldingi_hajm: oldingi, joriy_hajm: joriy, jami_hajm: oldingi + joriy, smeta_hajm: s.hajm };
  });
  // Server faqat_faol=1: hajmi nolga teng bo'lmagan qatorlar (qoralama/fakt/qo'shimcha belgisi bo'lganlar ham — nol hajm bilan).
  const faol = toliq.filter((q, i) => q.oldingi_hajm !== 0 || q.joriy_hajm !== 0 || i % 101 === 0);

  it('natija to‘liq Nakopitelniy bilan AYNAN bir xil', () => {
    const a = nakQoldiqXaritalari(toliq, null);
    const b = nakQoldiqXaritalari(faol, smeta);
    expect(tartibla(b.old)).toEqual(tartibla(a.old));
    expect(tartibla(b.qol)).toEqual(tartibla(a.qol));
    expect(faol.length).toBeLessThan(toliq.length / 2);
  });

  it('smeta berilmasa — faqat Nakopitelniy qatorlari', () => {
    const b = nakQoldiqXaritalari(faol, null);
    expect(b.old.size).toBe(faol.length);
  });
});
