import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Qongiroqcha, bildirishnomaHavolasi } from './Qongiroqcha';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const javob = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const qator = (id: number, oqildi: string | null, mavzu = 'hujjat.xat_keldi') => ({
  id, kompaniya_id: 1, mavzu, sarlavha_kalit: `bildirishnoma.${mavzu}`, parametrlar: {}, havola: null, oqildi, yaratildi: '2026-11-04T10:00:00Z',
});

function stub() {
  const posts: Array<Record<string, unknown>> = [];
  const f = vi.fn((u: string, init?: RequestInit) => {
    if (String(u).startsWith('/api/hujjat-aylanish?') && String(u).includes('bolim=bildirishnomalar')) {
      return javob({ ok: true, qatorlar: [qator(1, null), qator(2, '2026-11-04T11:00:00Z', 'hujjat.tasdiqlandi')], oqilmagan: 1 });
    }
    if (u === '/api/hujjat-aylanish' && init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return javob({ ok: true, belgilandi: 1 }); }
    return javob({ ok: false, error: 'kutilmagan' });
  });
  vi.stubGlobal('fetch', f);
  return posts;
}

describe('Qongiroqcha', () => {
  it('o‘qilmagan sonini ko‘rsatadi, ochilganda ro‘yxat chiqadi va bosilganda o‘qildi deb belgilaydi', async () => {
    const posts = stub();
    render(<MemoryRouter><Qongiroqcha /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('qongiroq-soni').textContent).toBe('1'));
    fireEvent.click(screen.getByRole('button', { name: /Bildirishnomalar|Уведомления|Notifications/ }));
    const bandlar = await screen.findAllByRole('menuitem');
    expect(bandlar).toHaveLength(2);
    fireEvent.click(bandlar[0]);
    await waitFor(() => expect(posts).toEqual([{ amal: 'bildirishnoma_oqildi', idlar: [1] }]));
    await waitFor(() => expect(screen.queryByTestId('qongiroq-soni')).toBeNull());
  });
  it('o‘qilgan bildirishnoma qayta belgilanmaydi', async () => {
    const posts = stub();
    render(<MemoryRouter><Qongiroqcha /></MemoryRouter>);
    await waitFor(() => screen.getByTestId('qongiroq-soni'));
    fireEvent.click(screen.getByRole('button', { name: /Bildirishnomalar|Уведомления|Notifications/ }));
    fireEvent.click((await screen.findAllByRole('menuitem'))[1]);
    expect(posts).toEqual([]);
  });
  it('havola mavzu bo‘yicha aniqlanadi', () => {
    expect(bildirishnomaHavolasi({ havola: '/admin/x', mavzu: 'hujjat.xat_keldi' })).toBe('/admin/x');
    expect(bildirishnomaHavolasi({ havola: null, mavzu: 'hujjat.muddat_otdi' })).toBe('/admin/hujjat-aylanish');
    expect(bildirishnomaHavolasi({ havola: null, mavzu: 'tomon.murojaat' })).toBe('/admin/murojaatlar');
    expect(bildirishnomaHavolasi({ havola: null, mavzu: 'buyurtma.yangi' })).toBeNull();
  });
});
