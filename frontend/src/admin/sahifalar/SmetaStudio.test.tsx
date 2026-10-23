import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NormCatalog } from '../../lib/catalog-extraction/norm-catalog';
import { NormLibraryCatalog } from '../../lib/catalog-extraction/norm-library';
vi.mock('../../lib/catalog-extraction/norm-library', () => ({ NormLibraryCatalog: { open: vi.fn() } }));
import { RemoteNormCatalog } from '../../lib/catalog-extraction/norm-remote';
import { NORM_SHARD_SCHEMA, buildNormShards, type BookRow } from '../../lib/catalog-extraction/norm-shards';

vi.mock('../../i18n/til', () => ({ t: (s: string, p?: Record<string, string | number>) => p ? s.replace(/\{(\w+)\}/g, (_m, k: string) => String(p[k])) : s }));
const aiSources = vi.hoisted(() => [] as Array<{ katalog: unknown; command: (c: import('../../lib/smeta-studio/commands').StudioCommand) => boolean }>);
vi.mock('./SmetaAiChat', async importOriginal => {
  const original = await importOriginal<typeof import('./SmetaAiChat')>();
  const { createElement } = await import('react');
  return { ...original, SmetaAiChat: (props: Parameters<typeof original.SmetaAiChat>[0]) => {
    aiSources.push(props);
    return createElement(original.SmetaAiChat, props);
  } };
});
const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({ get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => { store.set(k, v); }, update: async (k: string, fn: (v: unknown) => unknown) => { store.set(k,fn(store.get(k))); } }));
import SmetaStudio from './SmetaStudio';
import { workUnitOf } from './studio-sozlama';
import { emptyDoc } from '../../lib/smeta-studio/model';
import { writeLibraryDraft } from '../../lib/smeta-studio/draft-library';
import * as serverSave from '../../lib/smeta-studio/server-save';
const companyScope=vi.hoisted(()=>({id:null as number|null}));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst',()=>({useKompaniya:()=>({joriyId:companyScope.id})}));

const REV = 'b'.repeat(16);
const blob = (s: string) => ({ text_cp1251: s });
const book: BookRow[] = [
  { ID: '1', IDPARENT: '0', NAME: 'ШНК', TIPBOOK: null, KODA: null, KODTAB: null },
  { ID: '2', IDPARENT: '1', NAME: 'E06-Бетонные работы', TIPBOOK: 'H', KODA: 'E06', KODTAB: null },
  { ID: '3', IDPARENT: '2', NAME: 'E6-1 Бетонная подготовка', TIPBOOK: 'H', KODA: 'E06', KODTAB: 'E6-1' },
];
function files() {
  const c = new NormCatalog();
  c.add('basis', { Kod: 10, KodE: 'E6-1-1', TipBook: 'H', KodA: 'E06', KodRaz: '01', KodPRaz: '001', KodTab: 'E6-1', KodI: '003', NameP: blob('Устройство бетонной подготовки') });
  c.add('basis', { Kod: 11, KodE: 'E6-1-2', TipBook: 'H', KodA: 'E06', KodRaz: '01', KodPRaz: '001', KodTab: 'E6-1', KodI: '003', NameP: blob('Другой бетонный фундамент') });
  c.add('basis', { Kod: 12, KodE: 'E99-1-1', TipBook: 'H', KodA: 'E99', KodTab: 'E99-1', NameP: blob('Работа с сохранённым названием') });
  c.add('material', { Kod: 20, KodM: 'C1', KodR: '001', NameP: blob('Бетон B7,5'), KodI: '005', Tip: 'M' });
  c.add('basisres', { Kod: 30, KodE: 'E6-1-1', KodM: 'C1', KodR: '001', NormaR: 1.02 });
  const built = buildNormShards(c, book, REV, [{ kod: 'E6-1-1', birlik: 'М3', n: 12 }]);
  const enc = new TextEncoder();
  return crypto.subtle && Promise.all([...built.files].map(async ([path, text]) => {
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
    return [path, { path, sha256: h, bytes: enc.encode(text).length }] as const;
  })).then(metas => {
    const meta = Object.fromEntries(metas);
    const manifest = { schema: NORM_SHARD_SCHEMA, revision: REV, status: 'REVIEW_ONLY', source: {}, counts: { basis: 1 }, caveats: [],
      linkage: {}, files: { tree: meta['tree.json'], works: meta['works.json'], shards: Object.fromEntries(Object.entries(built.shardIndex).map(([k, p]) => [k, meta[p]])) } };
    const all = new Map(built.files); all.set('manifest.json', JSON.stringify(manifest));
    return all;
  });
}
let requests: string[] = [];
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(520);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterAll(() => vi.restoreAllMocks());
beforeEach(async () => {
  localStorage.setItem('studio:catalog-source', 'legacy');
  aiSources.length = 0;
  companyScope.id=null;
  store.clear(); requests = []; sessionStorage.clear();
  // These tests exercise the catalogue tab; the AI estimator tab is the default for new users.
  try { localStorage.setItem('smeta-studio:chap-tab', 'katalog'); } catch { /* jsdom */ }
  const all = await files();
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${u}`);
    if (u.startsWith('/api/narx-katalog') || u.startsWith('/api/hour-price-catalog')) return new Response('', { status: 404 });
    const f = new URL(u, 'https://x').searchParams.get('f')!;
    if (f === 'current') return new Response(JSON.stringify({ revision: REV }));
    return all.has(f) ? new Response(all.get(f)!) : new Response('', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderEditor(){render(<SmetaStudio/>);fireEvent.click(within(screen.getByRole('navigation',{name:'Smeta ish joyi'})).getByRole('button',{name:'Ishlar'}));fireEvent.click(screen.getByRole('button',{name:'Tarkib va bo‘limlar'}));}

it('opens the three-panel workbench without starting a previously selected hidden pricing view',async()=>{
 localStorage.setItem('smeta-studio:bosqich','narx');
 try{render(<SmetaStudio/>);await screen.findByText('Shu qurilmada saqlandi');expect(screen.getByRole('main',{name:'Smeta jadvali'})).toBeTruthy();expect(screen.getByRole('complementary',{name:'Tanlangan ish nazorati'})).toBeTruthy();expect(screen.queryByLabelText('Obyekt hududi')).toBeNull();expect(requests.some(r=>r.startsWith('POST '))).toBe(false);}finally{localStorage.removeItem('smeta-studio:bosqich');}
});

it('chapdan ish tanlab o‘ngga qo‘shish: kuzatilgan birlik, resurs miqdori, narxsiz jami noma’lum; faqat GET', async () => {
  renderEditor();
  await screen.findByText('ШНК', undefined, { timeout: 8000 });
  fireEvent.change(screen.getByLabelText('Yangi bo‘lim nomi'), { target: { value: 'FM-1 fundamenti' } });
  fireEvent.submit(screen.getByLabelText('Yangi bo‘lim nomi').closest('form')!);
  // Named tree navigation: category → sbornik → table → works.
  fireEvent.click(screen.getByText('ШНК'));
  fireEvent.click(await screen.findByText('E06-Бетонные работы', undefined, { timeout: 8000 }));
  fireEvent.click(await screen.findByText('E6-1 Бетонная подготовка', undefined, { timeout: 8000 }));
  fireEvent.click(await screen.findByText('Устройство бетонной подготовки', undefined, { timeout: 8000 }));
  await screen.findByText('Бетон B7,5', undefined, { timeout: 8000 });
  expect(screen.getByText('М3')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('4,5'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: /Smetaga qo‘shish/ }));
  const panel = screen.getByRole('region', { name: 'Smeta qoralamasi' });
  // Operator does not need a hidden extra expansion step after adding the work.
  expect(await within(panel).findByRole('button', { name: 'Tanlash: Устройство бетонной подготовки' })).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Resurslar' }));
  fireEvent.click(await within(panel).findByRole('button', { name: 'Tanlash: Устройство бетонной подготовки' }, { timeout: 8000 }));
  expect((within(panel).getByLabelText('Ish hajmi') as HTMLInputElement).value).toBe('4');
  fireEvent.click(await within(panel).findByRole('button', { name: 'Tanlash: Бетон B7,5' }));
  expect(within(panel).getByText(/Ish hajmi: 4.080000/)).toBeTruthy(); // 4 м3 × 1.02 ÷ 1
  expect(within(panel).getAllByText(/Noma’lum/).length).toBeGreaterThan(0);
  // Narx faqat dalilli buyruq orqali; 4 × 1.02 × 500 = 2040.
  fireEvent.change(within(panel).getByLabelText('Birlik narxi'), { target: { value: '500' } });
  fireEvent.change(within(panel).getByLabelText('Narx manbasi'), { target: { value: 'Sinov taklifi, 2026-10-06' } });
  fireEvent.submit(within(panel).getByLabelText('Birlik narxi').closest('form')!);
  await waitFor(() => expect(within(panel).getAllByText(/2040/).length).toBeGreaterThan(0));
  expect(requests.every(r => /^GET \/api\/(norm-katalog|narx-katalog|hour-price-catalog|koef-katalog)/.test(r))).toBe(true);
  // Narxni bekor qilish noma'lum summani qaytaradi, retsept o'zgarmaydi.
  fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
  await waitFor(() => expect((within(panel).getByLabelText('Birlik narxi') as HTMLInputElement).value).toBe(''));
  // Undo removes the occurrence; the draft is persisted locally.
  fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
  await waitFor(() => expect(within(panel).queryByText('Устройство бетонной подготовки')).toBeNull());
});

it('birinchi katalog ishi bo‘limsiz ham bitta undo bilan qo‘shiladi', async () => {
  renderEditor();
  fireEvent.change(await screen.findByLabelText('Normativ ish qidirish'), { target: { value: 'beton' } });
  fireEvent.click(await screen.findByText('Устройство бетонной подготовки', undefined, { timeout: 8000 }));
  await screen.findByText('Бетон B7,5', undefined, { timeout: 8000 });
  fireEvent.click(screen.getByRole('button', { name: /Smetaga qo‘shish/ }));
  await screen.findByRole('button',{name:'Tanlash: Устройство бетонной подготовки'});
  expect(screen.getByRole('button',{name:'Tanlash: Asosiy ishlar'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Bekor qilish'}));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Tanlash: Asosiy ishlar'})).toBeNull());
});

it('tanlangan podrazdelga vergulli hajm qo‘shiladi; noto‘g‘ri hajm tugma yonida izohlanadi va saqlanadi', async () => {
  renderEditor();
  await screen.findByText('ШНК', undefined, { timeout: 8000 });
  const sectionInput = screen.getByLabelText('Yangi bo‘lim nomi');
  fireEvent.change(sectionInput, { target: { value: 'Fundament' } });
  fireEvent.submit(sectionInput.closest('form')!);
  fireEvent.click(screen.getByLabelText('Podrazdel qo‘shish'));
  fireEvent.change(sectionInput, { target: { value: 'FM-1' } });
  fireEvent.submit(sectionInput.closest('form')!);
  fireEvent.change(screen.getByLabelText('Normativ ish qidirish'), { target: { value: 'бетон' } });
  fireEvent.click(await screen.findByText('Устройство бетонной подготовки', undefined, { timeout: 8000 }));
  await screen.findByText('Бетон B7,5', undefined, { timeout: 8000 });
  const quantity = screen.getByPlaceholderText('4,5') as HTMLInputElement;
  const button = screen.getByRole('button', { name: /Smetaga qo‘shish/ });
  fireEvent.change(quantity, { target: { value: '-4' } });
  fireEvent.click(button);
  expect(within(button.closest('.space-y-2')!).getByRole('alert').textContent).toContain('Hajm noto‘g‘ri');
  expect(quantity.value).toBe('-4');
  fireEvent.change(quantity, { target: { value: '4,5' } });
  fireEvent.click(button);
  expect(await screen.findByText('Ish «Устройство бетонной подготовки» «FM-1» bo‘limiga qo‘shildi.')).toBeTruthy();
  const panel = screen.getByRole('region', { name: 'Smeta qoralamasi' });
  fireEvent.click(await within(panel).findByRole('button', { name: 'Tanlash: Устройство бетонной подготовки' }));
  expect((within(panel).getByLabelText('Ish hajmi') as HTMLInputElement).value).toBe('4.5');
  expect(quantity.value).toBe('');
});

it('katalog yuklanmagan bo‘lsa aniq holat ko‘rsatiladi', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  renderEditor();
  expect(await screen.findByText('Platforma normativ katalogi hali yuklanmagan.', undefined, { timeout: 8000 })).toBeTruthy();
});

it('BOOK bo‘limi topilmagan yozuv ish nomi yo‘q deb ko‘rsatilmaydi', async () => {
  renderEditor();
  fireEvent.click(await screen.findByText('Katalog bo‘limi aniqlanmagan yozuvlar (shifr bo‘yicha)', undefined, { timeout: 8000 }));
  expect(screen.getByText(/Bu yozuvlarning nomlari saqlangan/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Normativ ish qidirish'), { target: { value: 'E99-1-1' } });
  expect(await screen.findByText('Работа с сохранённым названием', undefined, { timeout: 8000 })).toBeTruthy();
});

it('sekin A javobi B tanlovining retseptini almashtirmaydi', async () => {
  const original = RemoteNormCatalog.prototype.load;
  let release!: () => void;
  const slow = new Promise<void>(resolve => { release = resolve; });
  const spy = vi.spyOn(RemoteNormCatalog.prototype, 'load').mockImplementation(async function (this: RemoteNormCatalog, id: string) {
    await original.call(this, id);
    if (this.works.find(w => w[0] === id)?.[1] === 'E6-1-1') await slow;
  });
  try {
    renderEditor();
    fireEvent.change(await screen.findByLabelText('Normativ ish qidirish'), { target: { value: 'бетон' } });
    fireEvent.click(await screen.findByText('Устройство бетонной подготовки', undefined, { timeout: 8000 }));
    fireEvent.click(await screen.findByText('Другой бетонный фундамент'));
    await screen.findByRole('heading', { name: /Другой бетонный фундамент/ });
    release();
    await slow;
    await waitFor(() => expect(screen.getByRole('heading', { name: /Другой бетонный фундамент/ })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: /Устройство бетонной подготовки/ })).toBeNull();
  } finally { release(); spy.mockRestore(); }
});


it('workspace navigation preserves the unsent AI message and manual document changes',async()=>{
 renderEditor();
 await screen.findByLabelText('Smeta nomi');
 fireEvent.click(screen.getByRole('tab',{name:'Smetachi AI'}));
 fireEvent.change(screen.getByLabelText('Smetachiga xabar'),{target:{value:'TEST ONLY unsent plan'}});
 const title=screen.getByLabelText('Smeta nomi');fireEvent.change(title,{target:{value:'TEST shared estimate'}});fireEvent.submit(title.closest('form')!);
 const nav=screen.getByRole('navigation',{name:'Smeta ish joyi'});
 fireEvent.change(screen.getByLabelText('Smeta obyekti'),{target:{value:'TEST unsent manual field'}});
 fireEvent.click(within(nav).getByRole('button',{name:'Tekshiruv'}));
 expect((screen.getByLabelText('Smetachiga xabar') as HTMLTextAreaElement).value).toBe('TEST ONLY unsent plan');
 fireEvent.click(within(nav).getByRole('button',{name:'Ishlar'}));
 expect((screen.getByLabelText('Smeta nomi') as HTMLInputElement).value).toBe('TEST shared estimate');
 expect((screen.getByLabelText('Smeta obyekti') as HTMLInputElement).value).toBe('TEST unsent manual field');
 fireEvent.click(screen.getByRole('tab',{name:'Hajm'}));fireEvent.click(screen.getByRole('tab',{name:'Smetachi AI'}));
 expect((screen.getByLabelText('Smetachiga xabar') as HTMLTextAreaElement).value).toBe('TEST ONLY unsent plan');
});
it('new estimate archives the previous draft and reopening restores the same document',async()=>{
 renderEditor();const title=await screen.findByLabelText('Smeta nomi');
 fireEvent.change(title,{target:{value:'TEST recoverable estimate'}});fireEvent.submit(title.closest('form')!);
 fireEvent.click(screen.getByRole('button',{name:'Yangi qoralama'}));
 await waitFor(()=>expect((screen.getByLabelText('Smeta nomi') as HTMLInputElement).value).toBe(''));
 fireEvent.click(screen.getByRole('button',{name:'Saqlangan qoralamalar'}));
 const library=await screen.findByRole('region',{name:'Saqlangan qoralamalar'});
 fireEvent.click(within(library).getByRole('button',{name:'TEST recoverable estimate'}));
 await waitFor(()=>expect((screen.getByLabelText('Smeta nomi') as HTMLInputElement).value).toBe('TEST recoverable estimate'));
 expect(requests.some(x=>x.startsWith('POST '))).toBe(false);
});

it('refresh restores this tab’s draft even when another tab saved the global last-draft pointer',async()=>{
 const own=emptyDoc('own-tab');own.context.title='TEST own tab';
 const other=emptyDoc('other-tab');other.context.title='TEST other tab';
 await writeLibraryDraft(null,own,3,0);await writeLibraryDraft(null,other,7,0);
 store.set('smeta-studio:last-draft',{doc:other,serverVersion:7});
 sessionStorage.setItem('smeta-studio:active-draft-v2',JSON.stringify({companyId:null,draftId:own.draftId}));
 renderEditor();
 await waitFor(()=>expect((screen.getByLabelText('Smeta nomi') as HTMLInputElement).value).toBe('TEST own tab'));
});

it('network retry identity changes for a different edit after undo even when edit counters match',async()=>{
 companyScope.id=1;const save=vi.spyOn(serverSave,'saveToServer').mockResolvedValue({ok:false,code:'NETWORK'});
 try{
  renderEditor();await screen.findByLabelText('Yangi bo‘lim nomi');
  const field=screen.getByLabelText('Yangi bo‘lim nomi');fireEvent.change(field,{target:{value:'First'}});fireEvent.submit(field.closest('form')!);
  fireEvent.click(screen.getByRole('button',{name:'Serverga saqlash'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));await screen.findByText('Tarmoq xatosi — qayta bosing, saqlash takrorlanmaydi.');
  fireEvent.click(screen.getByRole('button',{name:'Bekor qilish'}));fireEvent.change(field,{target:{value:'Different'}});fireEvent.submit(field.closest('form')!);
  fireEvent.click(screen.getByRole('button',{name:'Serverga saqlash'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[0][0].doc.edits).toBe(save.mock.calls[1][0].doc.edits);
  expect(save.mock.calls[0][0].operationId).not.toBe(save.mock.calls[1][0].operationId);
 }finally{save.mockRestore();companyScope.id=null;}
});
it('opt-in autosave saves the current draft and persists an emptied saved draft with its server version',async()=>{
 companyScope.id=1;const save=vi.spyOn(serverSave,'saveToServer').mockResolvedValueOnce({ok:true,versiya:7,yangilandi:'2026-10-22'}).mockResolvedValue({ok:true,versiya:8,yangilandi:'2026-10-22'});
 try{
  renderEditor();await screen.findByText('Shu qurilmada saqlandi');
  const field=screen.getByLabelText('Yangi bo‘lim nomi');fireEvent.change(field,{target:{value:'Autosaved'}});fireEvent.submit(field.closest('form')!);
  expect(save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('checkbox',{name:'Serverga avtomatik saqlash'}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1),{timeout:6000});await screen.findByText('Serverga saqlandi (versiya 7).');
  fireEvent.click(screen.getByRole('button',{name:'Bekor qilish'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(2),{timeout:6000});
  expect(save.mock.calls[1][0].expectedVersion).toBe(7);expect(save.mock.calls[1][0].doc.rootOrder).toEqual([]);
 }finally{save.mockRestore();companyScope.id=null;}
},15000);

it('keeps a newer autosave queued when its debounce expires during a request that returns NETWORK',async()=>{
 companyScope.id=1;let finish!: (r:serverSave.SaveResult)=>void;
 const pending=new Promise<serverSave.SaveResult>(resolve=>{finish=resolve;});
 const save=vi.spyOn(serverSave,'saveToServer').mockReturnValueOnce(pending).mockResolvedValue({ok:true,versiya:1,yangilandi:'2026-10-22'});
 try{
  renderEditor();await screen.findByText('Shu qurilmada saqlandi');
  const section=screen.getByLabelText('Yangi bo‘lim nomi');fireEvent.change(section,{target:{value:'Queued'}});fireEvent.submit(section.closest('form')!);
  fireEvent.click(screen.getByRole('checkbox',{name:'Serverga avtomatik saqlash'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1),{timeout:6000});
  const title=screen.getByLabelText('Smeta nomi');fireEvent.change(title,{target:{value:'Newer pending edit'}});fireEvent.submit(title.closest('form')!);
  await new Promise(resolve=>setTimeout(resolve,4400));expect(save).toHaveBeenCalledTimes(1);
  finish({ok:false,code:'NETWORK'});await waitFor(()=>expect(save).toHaveBeenCalledTimes(2),{timeout:2000});
  expect(save.mock.calls[1][0].doc.context.title).toBe('Newer pending edit');
 }finally{finish({ok:false,code:'NETWORK'});save.mockRestore();companyScope.id=null;}
},20000);


it('keeps the worksheet visible while selecting works and preserves an unsaved inspector quantity across tabs',async()=>{
 render(<SmetaStudio/>);
 fireEvent.change(await screen.findByLabelText('Normativ ish qidirish'),{target:{value:'beton'}});
 fireEvent.click(await screen.findByText('Устройство бетонной подготовки'));
 await screen.findByText('Бетон B7,5');
 const quantity=screen.getByPlaceholderText('4,5');
 fireEvent.change(quantity,{target:{value:'3'}});fireEvent.click(screen.getByRole('button',{name:/Smetaga qo‘shish/}));
 fireEvent.change(quantity,{target:{value:'4'}});fireEvent.click(screen.getByRole('button',{name:/Smetaga qo‘shish/}));
 const table=screen.getByRole('region',{name:'Smeta ishlar jadvali'});
 const inspector=screen.getByRole('complementary',{name:'Tanlangan ish nazorati'});
 const rows=within(table).getAllByRole('button',{name:/^E6-1-1/});
 expect(rows).toHaveLength(2);
 fireEvent.click(rows[1]);
 await waitFor(()=>expect((within(inspector).getByRole('textbox',{name:'Ish hajmi'}) as HTMLInputElement).value).toBe('4'));
 expect(within(table).getByRole('table')).toBeTruthy();
 const field=within(inspector).getByRole('textbox',{name:'Ish hajmi'});fireEvent.change(field,{target:{value:'7,5'}});
 fireEvent.click(within(inspector).getByRole('tab',{name:'Smetachi AI'}));
 fireEvent.change(screen.getByLabelText('Smetachiga xabar'),{target:{value:'TEST unsent selected work question'}});
 fireEvent.click(within(inspector).getByRole('tab',{name:'Hajm'}));
 expect((within(inspector).getByRole('textbox',{name:'Ish hajmi'}) as HTMLInputElement).value).toBe('7,5');
 fireEvent.click(rows[0]);
 expect((within(inspector).getByRole('textbox',{name:'Ish hajmi'}) as HTMLInputElement).value).toBe('3');
 fireEvent.click(within(inspector).getByRole('tab',{name:'Smetachi AI'}));
 expect((screen.getByLabelText('Smetachiga xabar') as HTMLTextAreaElement).value).toBe('TEST unsent selected work question');
 fireEvent.click(within(inspector).getByRole('tab',{name:'Resurs'}));
 expect(within(inspector).queryByRole('button',{name:'Ishni olib tashlash'})).toBeNull();
 expect(within(inspector).queryByRole('textbox',{name:'Ish hajmi'})).toBeNull();
 expect(within(inspector).getByRole('textbox',{name:'Birlik narxi'})).toBeTruthy();
 fireEvent.click(within(inspector).getByRole('tab',{name:'Koeff.'}));
 fireEvent.click(within(inspector).getByText('Koeffitsientni qo‘lda kiritish'));
 fireEvent.change(within(inspector).getByLabelText('Koeffitsient nomi'),{target:{value:'TEST work A only'}});
 fireEvent.click(rows[1]);fireEvent.click(within(inspector).getByRole('tab',{name:'Koeff.'}));
 expect((within(inspector).getByLabelText('Koeffitsient nomi') as HTMLInputElement).value).toBe('');
 expect(requests.some(r=>r.startsWith('POST '))).toBe(false);
});


it('switches catalogue sources without restoring or remapping the edited draft', async () => {
  const library = await RemoteNormCatalog.open();
  const open = vi.mocked(NormLibraryCatalog.open).mockResolvedValue(library as never);
  try {
    renderEditor();
    await screen.findByText('ШНК');
    const title = screen.getByLabelText('Smeta nomi');
    fireEvent.change(title, { target: { value: 'Source switch keeps draft' } });
    fireEvent.submit(title.closest('form')!);
    fireEvent.change(screen.getByLabelText('Normativ ish qidirish'), { target: { value: 'бетон' } });
    fireEvent.click(await screen.findByText('Устройство бетонной подготовки'));
    await screen.findByText('Бетон B7,5');
    fireEvent.click(screen.getByRole('button', { name: /Smetaga qo‘shish/ }));
    await screen.findByRole('button', { name: 'Tanlash: Устройство бетонной подготовки' });
    const oldAi = aiSources.at(-1)!;
    fireEvent.change(screen.getByLabelText('Kutubxona manbasi'), { target: { value: 'library' } });
    await screen.findByText('ШНК');
    expect(aiSources.at(-1)?.katalog).toBe(library);
    expect(oldAi.command({ type: 'SET_CONTEXT', context: { title: 'stale AI' } })).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('studio:catalog-source')).toBe('library');
    expect(within(screen.getByRole('region', { name: 'Normativ katalog' })).queryByRole('heading', { name: /Устройство бетонной подготовки/ })).toBeNull();
    expect((screen.getByLabelText('Smeta nomi') as HTMLInputElement).value).toBe('Source switch keeps draft');
    expect(screen.getByRole('button', { name: 'Tanlash: Устройство бетонной подготовки' })).toBeTruthy();
  } finally { open.mockReset(); }
});

it('clears the old catalogue while loading and rejects a late source response', async () => {
  const legacy = await RemoteNormCatalog.open();
  let release!: (c: typeof legacy) => void;
  const pending = new Promise<typeof legacy>(resolve => { release = resolve; });
  const open = vi.mocked(NormLibraryCatalog.open).mockReturnValue(pending as never);
  try {
    renderEditor(); await screen.findByText('ШНК');
    fireEvent.change(screen.getByLabelText('Kutubxona manbasi'), { target: { value: 'library' } });
    expect(screen.queryByLabelText('Normativ ish qidirish')).toBeNull();
    expect(screen.getByText('Normativ katalog yuklanmoqda...')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kutubxona manbasi'), { target: { value: 'legacy' } });
    await screen.findByText('ШНК');
    const nodes = vi.spyOn(legacy, 'childNodes');
    release(legacy); await pending;
    await waitFor(() => expect(screen.getByText('ШНК')).toBeTruthy());
    expect(nodes).not.toHaveBeenCalled(); nodes.mockRestore();
  } finally { release(legacy); open.mockReset(); }
});

it('shows raw source units without observation claims and blocks works without recipes', async () => {
  const library = await RemoteNormCatalog.open();
  const open = vi.mocked(NormLibraryCatalog.open).mockResolvedValue(library as never);
  const unit = vi.spyOn(library, 'unit').mockReturnValue(null);
  Object.defineProperty(library, 'sourceBasis', { configurable: true, value: () => ({ scale: null, unitLabel: null, evidence: null, origin: null }) });
  try {
    renderEditor(); await screen.findByText('ШНК');
    fireEvent.change(screen.getByLabelText('Kutubxona manbasi'), { target: { value: 'library' } });
    fireEvent.change(await screen.findByLabelText('Normativ ish qidirish'), { target: { value: 'Другой' } });
    fireEvent.click(await screen.findByText('Другой бетонный фундамент'));
    await screen.findByRole('heading', { name: /Другой бетонный фундамент/ });
    expect(screen.getByText(/^O‘lchov birligi:/).textContent).toContain('003');
    expect(screen.queryByText(/marta kuzatilgan/)).toBeNull();
    expect(screen.getByText('Resurs retsepti yo‘q — ishni smetaga qo‘shib bo‘lmaydi.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Smetaga qo‘shish/ }) as HTMLButtonElement).disabled).toBe(true);
  } finally { unit.mockRestore(); open.mockReset(); }
});


it('restores the selected library and displays explicit source scale with a physical quantity unit', async () => {
  const library = await RemoteNormCatalog.open();
  const open = vi.mocked(NormLibraryCatalog.open).mockResolvedValue(library as never);
  const unit = vi.spyOn(library, 'unit').mockReturnValue(null);
  Object.defineProperty(library, 'sourceBasis', { configurable: true, value: () => ({ scale: '100', unitLabel: 'м3', evidence: 'Source measure', origin: null }) });
  localStorage.setItem('studio:catalog-source', 'library');
  try {
    renderEditor();
    expect((screen.getByLabelText('Kutubxona manbasi') as HTMLSelectElement).value).toBe('library');
    fireEvent.change(await screen.findByLabelText('Normativ ish qidirish'), { target: { value: 'бетон' } });
    fireEvent.click(await screen.findByText('Устройство бетонной подготовки'));
    await screen.findByText('Бетон B7,5');
    expect(screen.getByText(/^Norma masshtabi:/).textContent).toContain('100 м3');
    expect(screen.getByLabelText('Hajm (м3)')).toBeTruthy();
    expect(screen.queryByText(/manbada aniqlanmagan/)).toBeNull();
    expect(screen.queryByText(/marta kuzatilgan/)).toBeNull();
    // A selected catalogue is not the source of every frozen occurrence;
    // literal measures are resolved from each occurrence during export.
    expect(workUnitOf(library)('unparsed source measure')).toBeNull();
  } finally { unit.mockRestore(); open.mockReset(); }
});
