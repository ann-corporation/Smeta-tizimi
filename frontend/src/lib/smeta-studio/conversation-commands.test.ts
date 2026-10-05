import { describe, expect, it } from 'vitest';
import { NormCatalog } from '../catalog-extraction/norm-catalog';
import type { ConversationFact } from '../catalog-extraction/conversation-estimate';
import { buildEstimateCommands, candidateWorks } from './conversation-commands';
import { applyCommand } from './commands';
import { emptyDoc } from './model';
import { calcDoc } from './calc';

const blob = (s: string) => ({ text_cp1251: s });
function catalog() {
  const c = new NormCatalog();
  c.add('basis', { Kod: 1, KodE: 'E6-1-1', KodI: '003', NameP: blob('Устройство бетонной подготовки') });
  c.add('basis', { Kod: 2, KodE: 'E6-1-2', KodI: '006', NameP: blob('Армирование фундаментов') });
  c.add('basis', { Kod: 3, KodE: 'E6-1-3', KodI: '003', NameP: blob('Бетонирование фундаментов') });
  c.add('material', { Kod: 10, KodM: 'C1', NameP: blob('Бетон'), KodI: '005' });
  c.add('basisres', { Kod: 20, KodE: 'E6-1-1', KodM: 'C1', NormaR: 1.02 });
  c.add('basisres', { Kod: 21, KodE: 'E6-1-3', KodM: 'C1', NormaR: 1.015 });
  c.add('basisres', { Kod: 22, KodE: 'E6-1-2', KodM: 'C1', NormaR: 0 });
  return c;
}
const text = 'FM-1 fundamenti uchun podbetonka qilindi 4m3 B7.5, armatura to\'qildi 4 tonna 12 lik, beton quyildi 15 m3 B15. Xuddi shu fundamentdan 14 dona qilindi';
const facts: ConversationFact[] = [
  { factId: 'f1', sourceQuote: 'podbetonka qilindi 4m3 B7.5', description: 'podbetonka', quantity: '4', unit: 'm3', materialQuote: 'B7.5' },
  { factId: 'f2', sourceQuote: 'armatura to\'qildi 4 tonna 12 lik', description: 'armatura', quantity: '4', unit: 't', materialQuote: '12 lik' },
  { factId: 'f3', sourceQuote: 'beton quyildi 15 m3 B15', description: 'beton', quantity: '15', unit: 'm3', materialQuote: 'B15' },
];
const selections = [{ factId: 'f1', workId: '1', tableLabel: null }, { factId: 'f2', workId: '2', tableLabel: null }, { factId: 'f3', workId: '3', tableLabel: null }];
let n = 0; const newId = () => 'id' + (++n);
const units = (code: string | null) => code === '003' ? { text: 'М3', scale: '1', base: 'м3', observations: 382, status: 'OBSERVED' as const, variants: [] } : null;
const build = (scope: Parameters<typeof buildEstimateCommands>[0]['scope'], intent: 'CREATE_ESTIMATE' | 'REGISTER_FACT' = 'CREATE_ESTIMATE', sel = selections) =>
  buildEstimateCommands({ intent, sourceText: text, facts, scope, selections: sel, sectionName: 'FM-1 fundamenti ×14', catalogRevision: 'a'.repeat(16), catalog: catalog(), unitOf: units, newId });

describe('chat → shared command layer', () => {
  it('scope unconfirmed: nothing is multiplied or added', () => {
    const r = build(null);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('REVIEW_BLOCKED');
  });
  it('PER_ITEM ×14 → 56 m3 / 56 t / 210 m3 through the same reducer and calculator', () => {
    const r = build({ basis: 'PER_ITEM', itemCount: '14', confirmationId: 'user-click-1' });
    expect(r.ok).toBe(true); if (!r.ok) return;
    const doc = r.commands.reduce(applyCommand, emptyDoc('d'));
    expect(Object.values(doc.occurrences).map(o => o.quantity)).toEqual(['56', '56', '210']);
    const c = calcDoc(doc);
    const podbetonka = Object.values(doc.occurrences)[0];
    expect(c.occurrences[podbetonka.id].lines[0].quantity).toBe('57.120000');   // 56 × 1.02 ÷ 1
    // Armatura KodI 006 has no observed unit: basis stays unconfirmed, quantity NULL — not guessed from "12 lik".
    const armatura = Object.values(doc.occurrences)[1];
    expect(armatura.basis.scale).toBeNull(); expect(c.occurrences[armatura.id].issues).toContain('BASIS_UNCONFIRMED');
  });
  it('TOTAL → 4 / 4 / 15', () => {
    const r = build({ basis: 'TOTAL', itemCount: '14', confirmationId: 'user-click-2' });
    if (!r.ok) throw new Error(r.code);
    expect(r.commands.filter(c => c.type === 'ADD_OCCURRENCE').map(c => c.type === 'ADD_OCCURRENCE' && c.quantity)).toEqual(['4', '4', '15']);
  });
  it('"qilindi" is not a Fakt write: REGISTER_FACT never produces estimate commands', () => {
    const r = build({ basis: 'PER_ITEM', itemCount: '14', confirmationId: 'x' }, 'REGISTER_FACT');
    expect(r).toMatchObject({ ok: false, code: 'FACT_INTENT_NOT_ESTIMATE' });
  });
  it('operator must pick a work for every fact (AI never chooses)', () => {
    const r = build({ basis: 'PER_ITEM', itemCount: '14', confirmationId: 'x' }, 'CREATE_ESTIMATE', selections.slice(0, 2));
    expect(r).toMatchObject({ ok: false, code: 'SELECTION_MISSING', details: ['f3'] });
  });
  it('candidates come from catalogue search only and always need review', () => {
    const c = catalog();
    const r = candidateWorks(c, { factId: 'x', sourceQuote: 'beton', description: 'бетонирование фундаментов', quantity: '1', unit: 'm3', materialQuote: null });
    expect(r.needsReview).toBe(true);
    expect(r.candidates[0].code).toBe('E6-1-3');
    expect(candidateWorks(c, { factId: 'y', sourceQuote: 'q', description: 'kosmik kema', quantity: '1', unit: 'item', materialQuote: null }).candidates).toEqual([]);
  });
});
