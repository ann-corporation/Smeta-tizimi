import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NormCatalog } from '../../lib/catalog-extraction/norm-catalog';
import { RemoteNormCatalog } from '../../lib/catalog-extraction/norm-remote';
import { NORM_SHARD_SCHEMA, buildNormShards, type BookRow } from '../../lib/catalog-extraction/norm-shards';

vi.mock('../../i18n/til', () => ({ t: (s: string, p?: Record<string, string | number>) => p ? s.replace(/\{(\w+)\}/g, (_m, k: string) => String(p[k])) : s }));
const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({ get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => { store.set(k, v); } }));
import SmetaStudio from './SmetaStudio';

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
  store.clear(); requests = [];
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

it('chapdan ish tanlab o‘ngga qo‘shish: kuzatilgan birlik, resurs miqdori, narxsiz jami noma’lum; faqat GET', async () => {
  render(<SmetaStudio />);
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
  expect(requests.every(r => /^GET \/api\/(norm-katalog|narx-katalog|hour-price-catalog)/.test(r))).toBe(true);
  // Narxni bekor qilish noma'lum summani qaytaradi, retsept o'zgarmaydi.
  fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
  await waitFor(() => expect((within(panel).getByLabelText('Birlik narxi') as HTMLInputElement).value).toBe(''));
  // Undo removes the occurrence; the draft is persisted locally.
  fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
  await waitFor(() => expect(within(panel).queryByText('Устройство бетонной подготовки')).toBeNull());
});

it('bo‘limsiz qo‘shish aniq xato beradi, jim yutilmaydi', async () => {
  render(<SmetaStudio />);
  fireEvent.change(await screen.findByLabelText('Normativ ish qidirish'), { target: { value: 'beton' } });
  fireEvent.click(await screen.findByText('Устройство бетонной подготовки', undefined, { timeout: 8000 }));
  await screen.findByText('Бетон B7,5', undefined, { timeout: 8000 });
  fireEvent.click(screen.getByRole('button', { name: /Smetaga qo‘shish/ }));
  expect((await screen.findAllByRole('alert')).every(el => el.textContent?.includes('bo‘limni tanlang'))).toBe(true);
});

it('tanlangan podrazdelga vergulli hajm qo‘shiladi; noto‘g‘ri hajm tugma yonida izohlanadi va saqlanadi', async () => {
  render(<SmetaStudio />);
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
  render(<SmetaStudio />);
  expect(await screen.findByText('Platforma normativ katalogi hali yuklanmagan.', undefined, { timeout: 8000 })).toBeTruthy();
});

it('BOOK bo‘limi topilmagan yozuv ish nomi yo‘q deb ko‘rsatilmaydi', async () => {
  render(<SmetaStudio />);
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
    render(<SmetaStudio />);
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
