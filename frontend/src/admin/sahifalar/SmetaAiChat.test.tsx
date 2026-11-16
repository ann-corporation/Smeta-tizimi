import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyDoc } from '../../lib/smeta-studio/model';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import type { AiKatalog } from '../../lib/smeta-ai/worker';
import { SmetaAiChat } from './SmetaAiChat';

const work = { id: '1', code: 'E6-1-1', name: 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', unitCode: 'u', collection: null, section: null, subsection: null, tableCode: null };
const katalog = {
  manifest: { revision: 'rev' }, tableLabel: () => null, load: async () => {},
  search: (q: string) => ({ rows: q.toLowerCase().includes('подгот') ? [work] : [], total: 1 }),
  unit: () => ({ text: '100 М3', scale: '100', base: 'м3', observations: 5, status: 'OBSERVED', variants: [] }),
  detail: () => ({ work, workCodeAmbiguous: false, recipeCount: 0, recipes: [] }),
} as unknown as AiKatalog;
let calls: Array<{ amal: string }> = [];
beforeEach(() => {
  calls = []; localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body)); calls.push(b);
    if (b.amal === 'suhbat') return new Response(JSON.stringify({ ok: true, model: 'm', javob: 'Fundamentni 3 ishga ajratdim.', savollar: ['Armatura necha tonna?'],
      ishlar: [{ id: 'w1', bolim: 'Fundament', tavsif: 'Beton tayyorlov B7,5', qidiruv: ['Устройство бетонной подготовки'], birlik: 'м3',
        hajmIfoda: '48*0,6*0,1', hajmIzoh: '48 × 0,6 × 0,1', material: 'Бетон B7,5', holat: 'TAYYOR' }] }));
    return new Response(JSON.stringify({ ok: true, tanlovlar: [{ id: 'w1', ishId: '1', sabab: 'beton tayyorlov, м3' }] }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('recovers a missing catalogue match from an R2 table and adds the catalogue recipe after approval', async () => {
  const right = { ...work, code: 'E6-1-1-3', name: 'ПОДГОТОВКА БЕТОННАЯ', tableCode: 'E6-1-1' };
  const wrong = { ...right, id: 'wrong', code: 'E6-1-1-4', unitCode: 'wrong' };
  const catalog = {
    ...katalog, allWorks: () => [right, wrong],
    unit: (code: string) => ({ ...katalog.unit(code), ...(code === 'wrong' ? { text: '100 М2', base: 'м2' } : {}) }),
    detail: () => ({ work: right, workCodeAmbiguous: false, recipeCount: 1, recipes: [
      { id: 'recipe', resourceStatus: 'EXACT', norm: '0.25', candidates: [{ code: 'R-001', name: 'Synthetic resource' }],
        candidateCount: 1, prices: [], priceCount: 0 },
    ] }),
  } as unknown as AiKatalog;
  const baseFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).startsWith('/api/normativ-qidir?')) {
      return Response.json({ ok: true, natijalar: [
        { norma_kod: '4.02.06-04', jadval_kod: null, iqtibos: 'Таблица 06-01-001. Синтетический пример.', sha256: 'a'.repeat(64), sahifa_pdf: 7 },
      ] });
    }
    if (init?.body && JSON.parse(String(init.body)).amal === 'suhbat') {
      return Response.json({ ok: true, javob: 'Ish ajratildi', savollar: [], ishlar: [
        { id: 'w1', bolim: 'Asos', tavsif: 'Podbetonka', qidiruv: ['монолитная заливка'],
          birlik: 'м3', hajmIfoda: '2', material: null, holat: 'TAYYOR' },
      ] });
    }
    return baseFetch(url, init);
  });
  const command = vi.fn(() => true);
  let id = 0;
  render(<SmetaAiChat doc={emptyDoc('d')} katalog={catalog} kompaniyaId={7} command={command} newId={() => 'id' + ++id} />);
  fireEvent.change(screen.getByLabelText('Smetachiga xabar'), { target: { value: '2 m3 podbetonka' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
  await screen.findByText(/ShNQ: 4\.02\.06-04, 06-01-001, PDF 7/);
  expect((screen.getByRole('button', { name: /Tayyorlarini smetaga qo‘shish \(0\)/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Ha, to‘g‘ri' }));
  fireEvent.click(screen.getByRole('button', { name: /Tayyorlarini smetaga qo‘shish \(1\)/ }));
  await waitFor(() => expect(command).toHaveBeenCalledWith(expect.objectContaining({ commands: expect.arrayContaining([
    expect.objectContaining({ type: 'ADD_OCCURRENCE', source: expect.objectContaining({ code: right.code }),
      recipe: [expect.objectContaining({ recipeId: 'recipe', norm: '0.25', resource: expect.objectContaining({ code: 'R-001' }) })] }),
  ]) })));
});

it('the operator can search and select a norm outside the AI shortlist without changing the estimate', async () => {
  const commands = vi.fn(() => true);
  const extra = { ...work, id: 'outside', code: 'E6-1-1-22', name: 'BOSHQA NORMA' };
  const searchable = { ...katalog, search: (q: string, page: number) => q === 'E6-1-1-22'
    ? { rows: page === 0 ? [extra] : [], total: 1 } : katalog.search(q, page) };
  render(<SmetaAiChat doc={emptyDoc('d')} katalog={searchable} kompaniyaId={7} command={commands} newId={() => 'x'} />);
  fireEvent.change(screen.getByLabelText('Smetachiga xabar'), { target: { value: 'podbetonka B7.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
  await screen.findByDisplayValue('48*0,6*0,1');
  fireEvent.change(screen.getByLabelText('Norma kodi yoki nomi'), { target: { value: 'E6-1-1-22' } });
  fireEvent.click(screen.getByRole('button', { name: 'Qidirish' }));
  fireEvent.click(screen.getByRole('button', { name: /BOSHQA NORMA/ }));
  expect(screen.getByDisplayValue(/E6-1-1-22.*BOSHQA NORMA/)).toBeTruthy();
  expect(screen.getByText('Normaning ish tarkibi (manba bo‘yicha)')).toBeTruthy();
  expect(commands).not.toHaveBeenCalled();
});

it('describes work in words → grounded normative work, quantity computed by code → one batch into the estimate', async () => {
  const cmds: StudioCommand[] = [];
  let n = 0;
  render(<SmetaAiChat doc={emptyDoc('d')} katalog={katalog} kompaniyaId={7} command={c => { cmds.push(c); return true; }} newId={() => 'id' + ++n} />);
  fireEvent.change(screen.getByLabelText('Smetachiga xabar'), { target: { value: 'Fundament qilindi, podbetonka quyildi, 48×0,6×0,1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
  await screen.findByText(/Fundamentni 3 ishga ajratdim/);
  expect(screen.getByText(/Armatura necha tonna\?/)).toBeTruthy();
  await waitFor(() => expect(screen.getByText('= 2,88 м3')).toBeTruthy());
  expect(calls.map(c => c.amal).filter(a => a !== 'xotira' && a !== 'tajriba_yoz')).toEqual(['suhbat', 'tanla']);
  fireEvent.click(screen.getByRole('button', { name: /Tayyorlarini smetaga qo‘shish \(1\)/ }));
  await waitFor(() => expect(cmds).toHaveLength(1));
  const batch = cmds[0] as Extract<StudioCommand, { type: 'BATCH' }>;
  expect(batch.type).toBe('BATCH');
  expect(batch.commands.map(c => c.type)).toEqual(['ADD_SECTION', 'ADD_OCCURRENCE']);
  expect((batch.commands[1] as Extract<StudioCommand, { type: 'ADD_OCCURRENCE' }>).quantity).toBe('2.88');
});

it('editing the formula recomputes the quantity; an invalid formula blocks adding', async () => {
  render(<SmetaAiChat doc={emptyDoc('d')} katalog={katalog} kompaniyaId={7} command={() => true} newId={() => 'x'} />);
  fireEvent.change(screen.getByLabelText('Smetachiga xabar'), { target: { value: 'podbetonka' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
  const f = await screen.findByDisplayValue('48*0,6*0,1');
  fireEvent.change(f, { target: { value: '50*0,6*0,1' } });
  expect(screen.getByText('= 3 м3')).toBeTruthy();
  fireEvent.change(f, { target: { value: 'alert(1)' } });
  expect(screen.getByText('formula noto‘g‘ri')).toBeTruthy();
  expect((screen.getByRole('button', { name: /Tayyorlarini smetaga qo‘shish \(0\)/ }) as HTMLButtonElement).disabled).toBe(true);
});

it('a follow-up prose-only reply does not erase previously grounded works', async () => {
  render(<SmetaAiChat doc={emptyDoc('d')} katalog={katalog} kompaniyaId={7} command={() => true} newId={() => 'x'} />);
  fireEvent.change(screen.getByLabelText('Smetachiga xabar'), { target: { value: 'podbetonka 48×0,6×0,1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
  await screen.findByDisplayValue('48*0,6*0,1');
  await waitFor(() => expect((screen.getByRole('button', { name: 'Yuborish' }) as HTMLButtonElement).disabled).toBe(true));
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, tushunildi: true, javob: 'Takliflar saqlangan', savollar: [], ishlar: [] })));
  fireEvent.change(screen.getByLabelText('Smetachiga xabar'), { target: { value: 'Qani smetani ber' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
  await screen.findByText('Takliflar saqlangan');
  expect(screen.getByDisplayValue('48*0,6*0,1')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Tayyorlarini smetaga qo‘shish \(1\)/ })).toBeTruthy();
});
