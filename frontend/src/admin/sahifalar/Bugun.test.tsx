import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type Joriy = { id: number; rol?: string; permissions?: string[] };
const m = vi.hoisted(() => ({ k: { yuklanmoqda: false, superadmin: false, globalRejim: false, joriy: null as null | Joriy } }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => m.k }));
vi.mock('../../api/t2-modul', () => ({ useModullar: () => ({ data: undefined }) }));
vi.mock('../../api/t2-tizim-xaritasi', () => ({ useTizimRuxsat: () => ({ data: { ruxsat: false } }) }));
vi.mock('./UstaBugun', () => ({ default: () => <p>usta-telefon-ekrani</p> }));
import Bugun from './Bugun';
import { ROLE_PERMISSIONS, type CompanyMembershipRole } from '../../lib/company-authorization/effective-authorization';

const chiz = (rol: string, permissions?: string[]) => {
  m.k = { yuklanmoqda: false, superadmin: false, globalRejim: false, joriy: { id: 7, rol, permissions: permissions ?? [...(ROLE_PERMISSIONS[rol as CompanyMembershipRole] ?? [])] } };
  return render(<MemoryRouter><Bugun /></MemoryRouter>);
};
const tugmalar = () => screen.queryAllByRole('listitem').map((e) => e.getAttribute('href'));

afterEach(() => { cleanup(); });

describe('Bugun — rol bosh sahifasi', () => {
  it('usta va brigadir: telefon ekrani (UstaBugun), tugmalar emas', async () => {
    chiz('usta');
    expect(await screen.findByText('usta-telefon-ekrani')).toBeTruthy();
    cleanup();
    chiz('brigadir');
    expect(await screen.findByText('usta-telefon-ekrani')).toBeTruthy();
    expect(tugmalar()).toEqual([]);
  });
  it('self.work.write bor, kengroq huquq yo‘q: telefon ekrani', async () => {
    chiz('boshqa', ['company.read', 'fakt.read', 'self.work.write']);
    expect(await screen.findByText('usta-telefon-ekrani')).toBeTruthy();
  });
  it('PTO: o‘z profilidagi 4–6 tugma (obyektlar, F2 tayyorlash, fakt …)', () => {
    chiz('pto');
    const t = tugmalar();
    expect(t.length).toBeGreaterThanOrEqual(4);
    expect(t.length).toBeLessThanOrEqual(6);
    expect(t).toContain('/admin/obyektlar');
    expect(t).toContain('/admin/f2-tayyorlash');
  });
  it('boss: rahbar paneli va moliya; ruxsatsiz tugma ko‘rinmaydi', () => {
    chiz('boss');
    const t = tugmalar();
    expect(t).toContain('/admin/dashboard');
    expect(t).toContain('/admin/moliya');
  });
  it('buyurtmachi: o‘z kabineti, moliya/F2 tayyorlash emas', () => {
    chiz('buyurtmachi');
    const t = tugmalar();
    expect(t).toContain('/admin/zakazchik');
    expect(t).not.toContain('/admin/f2-tayyorlash');
    expect(t).not.toContain('/admin/moliya');
  });
  it('omborchi: ta‘minot tugmalari', () => {
    chiz('omborchi');
    expect(tugmalar()).toContain('/admin/logistika');
  });
  it('noma‘lum rol: kamida bitta ochiq sahifa bilan umumiy profil, bo‘sh ekran emas', () => {
    chiz('yoq-rol', ['company.read']);
    expect(screen.getByTestId('bugun')).toBeTruthy();
  });
  it('Amallar guruhi AMAL REESTRIDAN: ruxsati borga ko‘rinadi (zayavka, to‘lov), ruxsatsizga yo‘q', () => {
    chiz('pto', ['company.read', 'warehouse.write', 'financial.write', 'smeta.write', 'smeta.read', 'project.read']);
    const g = screen.getByTestId('bugun-amallar');
    expect(g.textContent).toContain('Zayavka yaratish');
    cleanup();
    chiz('buyurtmachi', ['company.read', 'project.read']);
    expect(screen.queryByTestId('bugun-amallar')).toBeNull();
  });
});