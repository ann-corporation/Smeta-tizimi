import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { qatlamSoni, sozlamaFiltr } from '../../lib/sozlama/sozlamaReestr';

const ctx = vi.hoisted(() => ({ superadmin: false, permissions: ['company.read'] as string[], mavqe: null as string | null }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({
  useKompaniya: () => ({
    foydalanuvchi: { ism: 'Anvar', login: 'anvar', email: 'a@b.uz', holat: 'faol' },
    joriy: { id: 7, nom: 'Test MChJ', rol: 'pto', permissions: ctx.permissions, mavqe: ctx.mavqe },
    joriyId: 7, kompaniyalar: [], superadmin: ctx.superadmin, globalRejim: false, yuklanmoqda: false,
  }),
}));
import SozlamalarMarkazi from './SozlamalarMarkazi';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); ctx.superadmin = false; ctx.permissions = ['company.read']; ctx.mavqe = null; });

function chiz(yol = '/admin/sozlamalar') {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ ok: false }) } as Response)));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[yol]}><SozlamalarMarkazi /></MemoryRouter></QueryClientProvider>);
}

describe('SozlamalarMarkazi', () => {
  it('hisoblar reestrdan: oddiy a‘zo uchun jami va qatlamlar; tizim tabi yo‘q', () => {
    chiz();
    const n = qatlamSoni(sozlamaFiltr({ superadmin: false, permissions: ['company.read'] }));
    expect(screen.getByRole('status').textContent).toContain(`Jami ${n.akkaunt + n.kompaniya} sozlama`);
    // Egasi 2026-10-27: tizimdagi umumiy son (yashirin tizim sozlamalari bilan) — faqat superadminga.
    expect(screen.getByRole('status').textContent).not.toContain('Tizimda jami');
    expect(screen.getAllByRole('tab').map((x) => x.textContent?.replace(/\d+$/, ''))).toEqual(['Akkaunt', 'Kompaniya']);
  });

  it('superadmin Tizim tabini ko‘radi va ?qatlam=tizim ishlaydi', () => {
    ctx.superadmin = true;
    chiz('/admin/sozlamalar?qatlam=tizim');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(document.querySelector('[data-sozlama="tizim.sayt_xaritasi"]')).toBeTruthy();
  });

  it('?qatlam=tizim oddiy a‘zoda akkauntga qaytadi', () => {
    chiz('/admin/sozlamalar?qatlam=tizim');
    expect(document.querySelector('[data-sozlama="akkaunt.til"]')).toBeTruthy();
    expect(document.querySelector('[data-sozlama="tizim.sayt_xaritasi"]')).toBeNull();
  });

  it('qidiruv nom/izoh/bo‘lim bo‘yicha filtrlaydi', () => {
    chiz();
    fireEvent.change(screen.getByLabelText('Sozlamalarni qidirish…'), { target: { value: 'parol' } });
    expect(document.querySelector('[data-sozlama="akkaunt.parol"]')).toBeTruthy();
    expect(document.querySelector('[data-sozlama="akkaunt.til"]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Sozlamalarni qidirish…'), { target: { value: 'yoqxuddishunaqa' } });
    expect(screen.getByText('Hech narsa topilmadi.')).toBeTruthy();
  });

  it('kompaniya tabi: turga mos kelmaganlar «Boshqa turdagi» bo‘limida', () => {
    ctx.mavqe = 'zakazchik';
    ctx.permissions = ['company.read', 'narx.read', 'company.profile.update'];
    chiz('/admin/sozlamalar?qatlam=kompaniya');
    expect(screen.getByText(/Test MChJ/)).toBeTruthy();
    const det = document.querySelector('details')!;
    expect(det.querySelector('[data-sozlama="kompaniya.nakrutka"]')).toBeTruthy();
    expect(det.querySelector('[data-sozlama="kompaniya.taqdimlar"]')).toBeNull();
    expect(document.querySelector('[data-sozlama="kompaniya.taqdimlar"]')).toBeTruthy();
  });
});
