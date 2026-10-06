import { describe, expect, it } from 'vitest';
import type { NormWork } from '../catalog-extraction/norm-catalog';
import { emptyDoc } from '../smeta-studio/model';
import { applyCommand } from '../smeta-studio/commands';
import { birlashtir, nomzodlarTop, smetagaQoshish, type AiKatalog } from './worker';
import { suhbatJavobiniTekshir, tanlovlarniTekshir } from './protokol';

const W = (id: string, code: string, name: string, unitCode: string): NormWork =>
  ({ id, code, name, unitCode, collection: null, section: null, subsection: null, tableCode: null });
const works = [W('1', 'E6-1-1', 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', 'u100m3'), W('2', 'E6-1-2', 'УСТРОЙСТВО ЖЕЛЕЗОБЕТОННЫХ ФУНДАМЕНТОВ ОБЩЕГО НАЗНАЧЕНИЯ', 'u100m3'),
  W('3', 'E6-9-1', 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ ПОД ПОЛЫ', 'u100m2'), W('4', 'E1-1-1', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ ЭКСКАВАТОРАМИ', 'u1000m3')];
const units: Record<string, { text: string; scale: string; base: string }> = { u100m3: { text: '100 М3', scale: '100', base: 'м3' }, u100m2: { text: '100 М2', scale: '100', base: 'м2' }, u1000m3: { text: '1000 М3', scale: '1000', base: 'м3' } };
const k: AiKatalog = {
  manifest: { revision: 'rev' },
  search: (q: string) => ({ rows: works.filter(w => q.toLowerCase().split(/\s+/).every((x: string) => (w.name ?? '').toLowerCase().includes(x))), total: 0 }),
  unit: (c: string | null) => (c && units[c] ? { ...units[c], observations: 10, status: 'OBSERVED', variants: [] } : null),
  load: async () => {}, tableLabel: () => null,
  detail: (id: string) => ({ work: works.find(w => w.id === id)!, workCodeAmbiguous: false, recipeCount: 1,
    recipes: [{ id: 'r' + id, workCode: 'x', resourceCode: null, resourceIdCode: '000001', norm: '2', resourceStatus: 'EXACT', candidates: [{ id: 'res', code: null, resourceIdCode: '000001', name: 'ЗАТРАТЫ ТРУДА', unitCode: '001', type: 'R' }], candidateCount: 1, prices: [], priceCount: 0 }] }),
} as unknown as AiKatalog;

const niyat = (over: Record<string, unknown> = {}) => suhbatJavobiniTekshir({ javob: 'ok', savollar: [], ishlar: [{
  id: 'w1', bolim: 'Fundament', tavsif: 'Beton tayyorlov B7,5 100 mm', qidiruv: ['Устройство бетонной подготовки'], birlik: 'м3',
  hajmIfoda: '12*0,6*0,1', hajmIzoh: '12×0,6×0,1', material: 'Бетон B7,5', holat: 'TAYYOR', ...over }] }).ishlar;

describe('smetachi AI — contract validation', () => {
  it('drops malformed intents and forces HAJM_KERAK without a formula', () => {
    const r = suhbatJavobiniTekshir({ javob: 'x', savollar: ['a', 'b'], ishlar: [
      { id: 'bad id!', bolim: '', tavsif: 'x', qidiruv: ['abc'], birlik: 'м3', holat: 'TAYYOR' },
      { id: 'w2', tavsif: 'y', qidiruv: ['Бетонирование'], birlik: 'литр', holat: 'TAYYOR' },
      { id: 'w3', tavsif: 'z', qidiruv: ['Армирование'], birlik: 'т', hajmIfoda: null, holat: 'TAYYOR' }] });
    expect(r.ishlar.map(i => [i.id, i.holat])).toEqual([['w3', 'HAJM_KERAK']]);
  });
  it('a catalogue choice the model was not given is discarded', () => {
    const s = [{ id: 'w1', tavsif: 't', birlik: 'м3' as const, material: null, nomzodlar: [{ id: '1', kod: 'E6', nom: 'n', birlik: null }] }];
    expect(tanlovlarniTekshir({ tanlovlar: [{ id: 'w1', ishId: '999', sabab: '' }] }, s)[0].ishId).toBeNull();
    expect(tanlovlarniTekshir({ tanlovlar: [{ id: 'w1', ishId: '1', sabab: 'mos' }] }, s)[0].ishId).toBe('1');
  });
});

describe('smetachi AI — catalogue grounding and batch', () => {
  it('finds candidates by phrase or stems; a different known unit is never offered', () => {
    const c = nomzodlarTop(k, { qidiruv: ['Устройство бетонная подготовка'], birlik: 'м3' });
    expect(c[0].id).toBe('1');                         // best stem coverage first
    expect(c.map(x => x.id)).not.toContain('3');       // м2 floor variant never offered for an м3 work
  });
  it('quantity is computed by code from the formula; merge keeps the user’s manual choice', () => {
    const [a] = birlashtir([], niyat());
    expect(a.hajm).toEqual({ qiymat: '0.72', ifoda: '12 × 0,6 × 0,1' });
    const chosen = { ...a, tanlangan: { workId: '1', kod: 'E6-1-1', nom: 'n', birlik: '100 М3', sabab: '', qolda: true } };
    const [b] = birlashtir([chosen], niyat({ hajmIfoda: '12*0,6*0,12' }));
    expect(b.tanlangan?.workId).toBe('1'); expect(b.hajm?.qiymat).toBe('0.864');
  });
  it('one batch: creates the section once, adds works with frozen snapshot; skips unready ones with a reason', async () => {
    const [a] = birlashtir([], niyat());
    const ready = { ...a, tanlangan: { workId: '1', kod: 'E6-1-1', nom: 'n', birlik: '100 М3', sabab: '' } };
    const [noQty] = birlashtir([], niyat({ id: 'w2', hajmIfoda: null }));
    const wrongUnit = { ...ready, id: 'w3', birlik: 'т' as const };
    let n = 0;
    const r = await smetagaQoshish(emptyDoc('d'), [ready, { ...noQty, tanlangan: ready.tanlangan }, wrongUnit], k, () => 'id' + ++n);
    expect(r.qoshildi).toEqual(['w1']);
    expect(r.otkazildi.map(x => x.id)).toEqual(['w2', 'w3']);
    const d = applyCommand(emptyDoc('d'), { type: 'BATCH', label: 'AI', commands: r.commands });
    const occ = Object.values(d.occurrences)[0];
    expect(d.sections[d.rootOrder[0]].name).toBe('Fundament');
    expect([occ.quantity, occ.basis.scale, occ.basis.unitLabel, occ.source.code]).toEqual(['0.72', '100', 'м3', 'E6-1-1']);
  });
});

describe('smetachi AI — tolerant to real model output', () => {
  it('accepts Latin units, a single search string, numeric formula and lower-case status', () => {
    const r = suhbatJavobiniTekshir({ javob: 'x', savollar: [], ishlar: [
      { id: 'w1', bolim: 'Plita', tavsif: 'Beton', qidiruv: 'Бетонирование плит', birlik: 'm3', hajmIfoda: 19.2, holat: 'tayyor' },
      { id: 'w2', bolim: 'Plita', tavsif: 'Armatura', qidiruv: ['Армирование'], birlik: 't', hajmIfoda: '1,8', holat: 'TAYYOR' },
      { id: 'w3', bolim: 'Plita', tavsif: 'Opalubka', qidiruv: ['Устройство опалубки'], birlik: 'кв.м', hajmIfoda: '2*(12+8)*0,2', holat: 'TAYYOR' }] });
    expect(r.ishlar.map(i => [i.id, i.birlik, i.hajmIfoda, i.holat])).toEqual([['w1', 'м3', '19.2', 'TAYYOR'], ['w2', 'т', '1,8', 'TAYYOR'], ['w3', 'м2', '2*(12+8)*0,2', 'TAYYOR']]);
  });
});
