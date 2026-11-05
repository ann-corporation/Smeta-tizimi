import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DesktopNazorat } from './DesktopNazorat';

const qurilma = (o: Record<string, unknown>) => ({
  device_id: '00000000-0000-4000-8000-000000000001', foydalanuvchi_id: 5, ism: 'Synthetic Ali', login: 'ali@example.invalid',
  qurilma_nomi: 'PC-ALI', os: 'windows', ilova_versiya: '0.1.0', yaratildi: '2026-11-01T10:00:00Z', oxirgi_kirish: '2026-11-05T09:00:00Z',
  tugaydi: Date.now() + 86400_000, sessiya_exp: Date.now() + 2 * 86400_000, bekor: null, bekor_sabab: null, holat: 'faol',
  oxirgi_lease: null, oxirgi_lease_kompaniya_id: null, oxirgi_lease_obyekt_soni: 2, lease_faol: true, kompaniyalar: [{ id: 8, nom: 'Synthetic Co' }], ...o,
});
const javob = (rol: 'superadmin' | 'kompaniya', extra: Record<string, unknown> = {}) => ({
  ok: true, rol, kompaniya_id: rol === 'kompaniya' ? 8 : null,
  umumiy: { faol: 1, oxirgi_24s: 1, bugun_bekor: 0, lease_faol: 1, kompaniyalar: 1 },
  qurilmalar: [qurilma({}), qurilma({ device_id: '00000000-0000-4000-8000-000000000002', ism: 'Synthetic Vali', qurilma_nomi: 'OLD', holat: 'bekor', bekor_sabab: 'yo‘qolgan' })],
  siyosat: [{ id: 1, kompaniya_id: null, kompaniya_nom: null, manba: 'platforma', yoqilgan: true, max_qurilma: 10, lease_soat: 72, oflayn: true,
    min_versiya: '0.2.0', joriy_versiya: '0.2.0', yuklab_olish_url: null, yangilanish_izoh: null, versiya: 4, yangilandi: '2026-11-05T08:00:00Z' }],
  samarali: rol === 'kompaniya' ? { yoqilgan: true, max_qurilma: 10, lease_soat: 72, oflayn: true, min_versiya: '0.2.0' } : null,
  audit: [{ id: 1, vaqt: '2026-11-05T08:00:00Z', actor_id: 1, actor_ism: 'Synthetic Boss', kompaniya_id: 8, amal: 'bekor', device_id: null, nishon_foydalanuvchi_id: 5, sabab: 'test sabab', meta: {} }],
  ...extra,
});

let read: unknown;
let posts: any[];
let postResult: { status: number; body: unknown };
beforeEach(() => {
  posts = []; postResult = { status: 200, body: { ok: true, soni: 1 } };
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push({ url, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify(postResult.body), { status: postResult.status }); }
    return new Response(JSON.stringify(read), { status: (read as { ok?: boolean }).ok ? 200 : 403 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(kompaniyaId: number | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><DesktopNazorat kompaniyaId={kompaniyaId} /></QueryClientProvider>);
}

describe('DesktopNazorat', () => {
  it('company boss: own company scope, overview, outdated-version stamp, no expiry action', async () => {
    read = javob('kompaniya'); setup(8);
    expect(await screen.findByText('Synthetic Ali')).toBeTruthy();
    expect((fetch as any).mock.calls[0][0]).toBe('/api/desktop/nazorat?kompaniya_id=8');
    expect(screen.getByText('Faol oflayn ruxsatlar')).toBeTruthy();
    expect(screen.getByText('Yangilash kerak')).toBeTruthy(); // 0.1.0 < 0.2.0
    expect(screen.queryByText('Synthetic Vali')).toBeNull(); // default filter: faol
    expect(screen.queryByRole('button', { name: /Muddat/ })).toBeNull();
    expect(screen.getByRole('form', { name: 'Kompaniya cheklovi' })).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Global siyosat (platforma)' })).toBeNull();
  });

  it('revoke requires a reason and sends the company scope; status filter shows revoked devices', async () => {
    read = javob('kompaniya'); setup(8);
    fireEvent.click(await screen.findByRole('button', { name: /Bekor qilish/ }));
    const form = screen.getByRole('form', { name: 'Amalni tasdiqlash' });
    const ok = within(form).getByRole('button', { name: /Tasdiqlash/ }) as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Sabab'), { target: { value: 'noutbuk yo‘qolgan' } });
    expect(ok.disabled).toBe(false);
    fireEvent.click(ok);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({ action: 'bekor', device_id: '00000000-0000-4000-8000-000000000001', kompaniya_id: 8, sabab: 'noutbuk yo‘qolgan' });
    expect(posts[0].body.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByRole('status')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Holat bo‘yicha'), { target: { value: 'bekor' } });
    expect(screen.getByText('Synthetic Vali')).toBeTruthy();
  });

  it('shows the server refusal instead of pretending success', async () => {
    read = javob('kompaniya'); setup(8);
    postResult = { status: 403, body: { ok: false, code: 'TENANT_FORBIDDEN' } };
    fireEvent.click(await screen.findByRole('button', { name: /Qayta kirishga majburlash/ }));
    const form = screen.getByRole('form', { name: 'Amalni tasdiqlash' });
    fireEvent.change(within(form).getByLabelText('Sabab'), { target: { value: 'test sabab' } });
    fireEvent.click(within(form).getByRole('button', { name: /Tasdiqlash/ }));
    expect(await screen.findByText('Bu foydalanuvchi sizning kompaniyangiz a’zosi emas.')).toBeTruthy();
    expect(posts[0].body).toMatchObject({ action: 'foydalanuvchi_bekor', foydalanuvchi_id: 5, kompaniya_id: 8 });
  });

  it('superadmin global: kill switch policy with optimistic version, installer fields, expiry action', async () => {
    read = javob('superadmin'); setup(null);
    expect(await screen.findByText('Desktopdan foydalanayotgan kompaniyalar')).toBeTruthy();
    expect((fetch as any).mock.calls[0][0]).toBe('/api/desktop/nazorat');
    expect(screen.getByRole('button', { name: /Muddat/ })).toBeTruthy();
    const form = screen.getByRole('form', { name: 'Global siyosat (platforma)' });
    fireEvent.change(within(form).getAllByRole('combobox')[0], { target: { value: 'yoq' } });
    fireEvent.change(within(form).getByLabelText('O‘zgartirish sababi'), { target: { value: 'avariya' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(window.confirm).toHaveBeenCalledTimes(1); // kill switch warns: all devices must sign in again
    expect(posts[0].body).toMatchObject({ action: 'siyosat', manba: 'platforma', kompaniya_id: null, expected_versiya: 4,
      qiymat: { yoqilgan: false, max_qurilma: 10, lease_soat: 72, oflayn: true, min_versiya: '0.2.0', joriy_versiya: '0.2.0' } });
  });

  it('kill switch is not saved when the warning is declined', async () => {
    read = javob('superadmin'); setup(null);
    (window.confirm as any).mockReturnValue(false);
    const form = await screen.findByRole('form', { name: 'Global siyosat (platforma)' });
    fireEvent.change(within(form).getAllByRole('combobox')[0], { target: { value: 'yoq' } });
    fireEvent.change(within(form).getByLabelText('O‘zgartirish sababi'), { target: { value: 'avariya' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(posts).toHaveLength(0);
  });

  it('boss: multi-company member and (for an admin) the boss have no revoke buttons; company form has no device cap', async () => {
    read = javob('kompaniya', { mening_rolim: 'admin', qurilmalar: [
      qurilma({ kop_kompaniya: true, qurilma_nomi: null, oxirgi_kirish: null }),
      qurilma({ device_id: '00000000-0000-4000-8000-000000000003', foydalanuvchi_id: 6, ism: 'Synthetic Boss', nishon_rol: 'boss' }),
    ] });
    setup(8);
    expect(await screen.findByText('Bir nechta kompaniya a’zosi — faqat superadmin')).toBeTruthy();
    expect(screen.getByText('Rahbar qurilmasi — faqat rahbar yoki superadmin')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bekor qilish/ })).toBeNull();
    const form = screen.getByRole('form', { name: 'Kompaniya cheklovi' });
    expect(within(form).queryByText('Qurilma limiti (1 kishiga)')).toBeNull();
  });

  it('denied read renders an explicit no-permission message', async () => {
    read = { ok: false, code: 'AUTHORIZATION_DENIED' }; setup(8);
    expect((await screen.findByRole('alert')).textContent).toContain('ruxsatingiz yo‘q');
  });
});
