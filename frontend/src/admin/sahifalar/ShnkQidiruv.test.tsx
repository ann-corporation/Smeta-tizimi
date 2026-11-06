// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ShnkQidiruv } from './ShnkQidiruv';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('uses the work reference and displays the returned source page and citation', async () => {
  const fetcher = vi.fn(async (_url: string) => Response.json({
    ok: true,
    natijalar: [{
      sha256: 'synthetic', norma_kod: 'SYNTHETIC', nom: 'Synthetic standard',
      tahrir: 'test', sahifa_pdf: 12, jadval_kod: '01-01-001',
      bob_punkt: null, iqtibos: 'Synthetic clause.', qisqartirilgan: false,
    }],
  }));
  vi.stubGlobal('fetch', fetcher);
  render(<ShnkQidiruv kompaniyaId={7} shifr="E1-1-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Normani ko‘rish' }));
  expect(await screen.findByText('Synthetic clause.')).toBeTruthy();
  expect(screen.getByText(/01-01-001.*12/)).toBeTruthy();
  expect(fetcher.mock.calls[0][0]).toBe('/api/normativ-qidir?kompaniya_id=7&q=E1-1-1');
});

it('submits free text and shows an explicit empty result', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, natijalar: [] })));
  render(<ShnkQidiruv kompaniyaId={7} />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'synthetic missing' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(await screen.findByText('Mos nashr qilingan normativ topilmadi.')).toBeTruthy();
});

it('lets the user retry an ambiguous edition with an explicit edition', async () => {
  const fetcher = vi.fn(async (_url: string) => Response.json({
    ok: true, sabab: 'EDITION_REQUIRED', natijalar: [],
  }));
  vi.stubGlobal('fetch', fetcher);
  render(<ShnkQidiruv kompaniyaId={7} shifr="SYN-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Normani ko‘rish' }));
  const edition = await screen.findByRole('textbox', { name: 'Normativ tahriri' });
  fireEvent.change(edition, { target: { value: 'Test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Normani ko‘rish' }));
  expect(fetcher.mock.calls[1][0]).toContain('tahrir=Test');
  await screen.findByRole('textbox', { name: 'Normativ tahriri' });
});
