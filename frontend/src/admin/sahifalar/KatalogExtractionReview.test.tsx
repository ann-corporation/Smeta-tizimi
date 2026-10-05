import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import KatalogExtractionReview from './KatalogExtractionReview';
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
afterEach(cleanup);
const packet = { schema: 'catalog-extraction-review-v1', source: { database: 'example', sha256: 'a'.repeat(64) },
  works: [{ KOD: '1', KODE: 'E1', NAMEP: 'Test work' }], recipes: [{ KOD: '2', KODE: 'E1', KODR: '001', NORMAR: '1.7600000' }],
  tables: [{ name: 'PRICE', key: 'KOD', rows: [{ KOD: '3', CENA: '123.4500000000' }] }] };
it('source preview, exact norm and price stay distinct; no network writes', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<KatalogExtractionReview />);
  const file = new File(['x'], 'review.json'); Object.defineProperty(file, 'text', { value: async () => JSON.stringify(packet) });
  fireEvent.change(screen.getByLabelText('Tayyorlangan manba paketi'), { target: { files: [file] } });
  expect(await screen.findByText('1.7600000')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Manba bo‘limi'), { target: { value: 'PRICE' } });
  expect(screen.getByText('123.4500000000')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
});
it('broken input hides stale result and shows professional error', async () => {
  render(<KatalogExtractionReview />);
  const file = new File(['x'], 'review.json'); Object.defineProperty(file, 'text', { value: async () => 'bad' });
  fireEvent.change(screen.getByLabelText('Tayyorlangan manba paketi'), { target: { files: [file] } });
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.queryByText('Test work')).toBeNull();
});
