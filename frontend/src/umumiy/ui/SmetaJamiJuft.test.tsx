import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { summaPaket } from '../../lib/summa-paket';
import { smetaJuftlik } from '../../lib/smeta-jami';
import { SmetaJamiJuft } from './SmetaJamiJuft';

afterEach(cleanup);
const p = (qqsBilan: number, ustamasiz: number) => summaPaket({ qqs_bilan: qqsBilan, qqs: 0, ustamali: ustamasiz, ustamasiz, kesim: {}, soat: {} });
const korsat = (j: ReturnType<typeof smetaJuftlik>) => render(<MemoryRouter><SmetaJamiJuft juft={j} /></MemoryRouter>);
const matn = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/\s+/g, ' ').trim();

describe('SmetaJamiJuft — asl katta, joriy kichik, ikkalasi yorliqli', () => {
  it('farqli: asosiy «Asl smeta» yorlig‘i + ostida joriy yorlig‘i va summasi', () => {
    korsat(smetaJuftlik(p(1000, 800), p(7810, 6000)));
    expect(matn('summa-qqs-yorliq')).toBe('Asl smeta, QQS bilan');
    expect(matn('summa-qqs')).toContain('1 000');
    expect(matn('smeta-joriy')).toContain('Joriy smeta (qo‘shimcha ishlar bilan)');
    expect(matn('smeta-joriy')).toContain('7 810');
  });
  it('teng: bitta son, joriy qatori yo‘q', () => {
    korsat(smetaJuftlik(p(1000, 800), p(1000, 800)));
    expect(matn('summa-qqs-yorliq')).toBe('Smeta (asl = joriy), QQS bilan');
    expect(screen.queryByTestId('smeta-joriy')).toBeNull();
  });
  it('joriy noma’lum (null) — «noma’lum», 0 emas', () => {
    korsat(smetaJuftlik(p(1000, 800), null));
    expect(matn('smeta-joriy')).toContain('noma’lum');
    expect(matn('smeta-joriy')).not.toMatch(/\b0\b/);
  });
  it('joriy yuklanmagan (undefined) — joriy qatori ko‘rsatilmaydi', () => {
    korsat(smetaJuftlik(p(1000, 800)));
    expect(screen.queryByTestId('smeta-joriy')).toBeNull();
    expect(matn('summa-qqs-yorliq')).toBe('Asl smeta, QQS bilan');
  });
});
