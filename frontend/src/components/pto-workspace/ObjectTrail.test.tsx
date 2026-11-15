import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./useLineage', () => ({
  useCompanyLineage: () => ({ data: {
    loyihalar: [{ id: 3, nom: 'Navoiy bog‘i' }],
    obyektlar: [{ id: 9, nom: 'Game Club yonidagi uzun nomli bino', loyiha_id: 3, asosiy_shartnoma_id: 4 }],
    shartnomalar: [{ id: 4, raqam: '12', nom: 'Qurilish' }],
  } }),
}));
vi.mock('./hierarchy', () => ({ contractObjects: () => [9] }));
import { ObjectTrail } from './ObjectTrail';

afterEach(cleanup);

describe('ObjectTrail — telefonda bitta qator', () => {
  it('desktop: to‘liq zanjir saqlanadi (o‘raladi); telefon: o‘rta bo‘laklar yig‘ilib «…», oxirgi bo‘lak ellipsis + title', () => {
    render(<MemoryRouter><ObjectTrail companyId={1} objectId={9} /></MemoryRouter>);
    const nav = screen.getByTestId('obyekt-yol');
    expect(nav.className).toMatch(/md:flex-wrap/);
    expect(nav.className).toMatch(/max-md:flex-nowrap/);
    const havolalar = nav.querySelectorAll('a');
    expect(havolalar).toHaveLength(4);                                   // Barcha loyihalar, loyiha, shartnoma, «…»
    expect(Array.from(havolalar).slice(0, 3).every((a) => /max-md:hidden/.test(a.className))).toBe(true);
    expect(screen.getByTestId('yol-yig').className).toMatch(/md:hidden/);
    const oxirgi = nav.querySelector('[aria-current="page"]')!;
    expect(oxirgi.className).toMatch(/max-md:truncate/);
    expect(oxirgi.getAttribute('title')).toBe('Game Club yonidagi uzun nomli bino');
  });
});
