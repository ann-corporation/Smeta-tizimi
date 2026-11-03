import { expect, it } from 'vitest';
import { hamrohDaraxti } from '../../src/lib/smeta-anatomiya/yuklash';
import { bolimSummalari } from '../../src/lib/fakt-jurnal';
import type { SvodQatori, SvodVaraq } from '../../src/lib/smeta-anatomiya/turlar';
import type { T2Qator } from '../../src/api/supabase';

it('standalone fixed-price svod work retains its known amount in the journal Smeta total', () => {
  const q: SvodQatori = { tur: 'xat_lumpsum', xom: 'Synthetic fixed work', tartib: '1',
    manzil: { fayl: 'synthetic.xlsx', varaq: 'svod', qator: 5 }, qiymatlar: [],
    summa: { ustun: 2, sarlavha: 'Стоимость без НДС, сум', qiymat: 100, masshtab: 1, ndsBilan: false },
    xat: { raqam: 'SYN-1', sana: null } };
  const svod: SvodVaraq = { fayl: 'synthetic.xlsx', varaq: 'svod', shakl: 'modda', qatorlar: [q], nds: null, review: [], holat: 'kutmoqda' };
  const result = hamrohDaraxti({ transport: [], xatlar: [{ svod, qator: q }] });
  const work = result.tree[0].children![0];
  expect(work).toMatchObject({ type: 'bl', hajm: 1, narx: 100, summa: 100, children: [] });
  // Consumer contract fixture: canonical rows preserve the emitted structure and source amount.
  // This does not call the import writer or assert its persistence behavior.
  const rows = [
    { id: 1, tur: 'rz', ota_id: null, nom: 'Synthetic svod', kat: null },
    { id: 2, tur: work.type, ota_id: 1, nom: work.nom, hajm: work.hajm, narx: work.narx, summa: work.summa, kat: null },
    { id: 3, tur: 'rz', ota_id: null, nom: 'Synthetic existing LRV', kat: null },
    { id: 4, tur: 'mat', ota_id: 3, nom: 'Known existing resource', kat: 'МАТ', hajm: 1, narx: 50, summa: 50 },
  ] as T2Qator[];
  const states = [
    { qator_id: 2, smeta_hajm: 1, smeta_summa: 100, fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0 },
    { qator_id: 4, smeta_hajm: 1, smeta_summa: 50, fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0 },
  ];
  expect(bolimSummalari(rows.slice(2), states.slice(1)).get(0)?.smeta.ustamasiz).toBe(50);
  const sums = bolimSummalari(rows, states);
  expect(sums.get(0)?.smeta.ustamasiz).toBe(150);
});
