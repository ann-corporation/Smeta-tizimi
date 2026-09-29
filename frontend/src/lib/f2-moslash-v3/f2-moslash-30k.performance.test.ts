import { describe, expect, it } from 'vitest';
import { f2MoslashV3, type SmetaQator } from './index';
import type { F2Tugun } from '../smeta-anatomiya/f2';

const BO_LIMI = 499;
const ISH_SONI = 14_750;

function benchmarkData(): { f2: F2Tugun[]; smeta: SmetaQator[] } {
  let id = 0;
  let ishNo = 0;
  const smeta: SmetaQator[] = [{
    id: ++id, otaId: null, tur: 'rz', kod: null, nom: 'OBYEKT', birlik: null, hajm: null, tartib: id,
  }];
  const root: F2Tugun = {
    uid: 'F2!1', tur: 'rz', kod: null, nom: 'OBYEKT', birlik: null, hajm: null, narx: null, summa: null,
    manzil: { fayl: 'synthetic.xlsx', varaq: 'Akt', qator: 1 }, yol: [], bolalar: [], barg: false,
  };
  const sections = Array.from({ length: BO_LIMI }, (_, index) => {
    const name = `РАЗДЕЛ ${String(index + 1).padStart(3, '0')}`;
    const sectionId = ++id;
    smeta.push({ id: sectionId, otaId: 1, tur: 'rz', kod: null, nom: name, birlik: null, hajm: null, tartib: sectionId });
    const section: F2Tugun = {
      uid: `F2!${sectionId}`, tur: 'rz', kod: null, nom: name, birlik: null, hajm: null, narx: null, summa: null,
      manzil: { fayl: 'synthetic.xlsx', varaq: 'Akt', qator: sectionId }, yol: ['OBYEKT'], bolalar: [], barg: false,
    };
    root.bolalar.push(section);
    return section;
  });

  for (let sectionIndex = 0; sectionIndex < sections.length && ishNo < ISH_SONI; sectionIndex++) {
    const section = sections[sectionIndex];
    const sectionId = Number(section.uid.split('!')[1]);
    const inSection = sectionIndex < 280 ? 30 : 29;
    for (let localIndex = 0; localIndex < inSection; localIndex++) {
      if (ishNo >= ISH_SONI) break;
      const code = `W${String(ishNo + 1).padStart(5, '0')}`;
      const resourceCode = `R${String(ishNo + 1).padStart(5, '0')}`;
      const workId = ++id;
      const resourceId = ++id;
      smeta.push(
        { id: workId, otaId: sectionId, tur: 'bl', kod: code, nom: `ISH ${code}`, birlik: 'M3', hajm: 10, tartib: workId },
        { id: resourceId, otaId: workId, tur: 'rs', kod: resourceCode, nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', birlik: 'ЧЕЛ-Ч', hajm: 2, tartib: resourceId },
      );
      const resource: F2Tugun = {
        uid: `F2!${resourceId}`, tur: 'rs', kod: resourceCode, nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', birlik: 'ЧЕЛ-Ч',
        hajm: 2, narx: 1, summa: 2, manzil: { fayl: 'synthetic.xlsx', varaq: 'Akt', qator: resourceId },
        yol: ['OBYEKT', section.nom], bolalar: [], barg: true,
      };
      section.bolalar.push({
        uid: `F2!${workId}`, tur: 'bl', kod: code, nom: `ISH ${code}`, birlik: 'M3', hajm: 1,
        narx: 2, summa: 2, manzil: { fayl: 'synthetic.xlsx', varaq: 'Akt', qator: workId },
        yol: ['OBYEKT', section.nom], bolalar: [resource], barg: false,
      });
      ishNo++;
    }
  }
  return { f2: [root], smeta };
}

describe('F2 matching at construction-estimate scale', () => {
  it('matches a 30,000-row nested estimate and F2 without quadratic row scans', () => {
    const { f2, smeta } = benchmarkData();
    expect(smeta).toHaveLength(30_000);
    const started = Date.now();
    const result = f2MoslashV3(f2, smeta);
    const elapsedMs = Date.now() - started;

    expect(result.stat).toEqual({ aniq: ISH_SONI * 2, xotira: 0, taklif: 0, topilmadi: 0 });
    expect(result.rzDiag).toHaveLength(BO_LIMI + 1);
    expect(elapsedMs).toBeLessThan(20_000);
  }, 30_000);
});
