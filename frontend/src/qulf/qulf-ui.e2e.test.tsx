// @vitest-environment jsdom
/**
 * QULF veb oqimi uchidan-uchiga: QulfBolimi inputlari (pinMaydon tozalagichi) -> api.ts -> HAQIQIY /api/qulf handler (cookie sessiya, soxta PostgREST)
 * va QulfOyna klaviaturasi (tugma + klaviatura) -> pin_tekshir. 2026-11-15 prod xatosi regressiyasi.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { imzola } from '../../functions/_shared/auth';
import { soxtaSupabase } from '../../functions/_shared/qulf-soxta';
type H = (c: { request: Request; env: unknown }) => Promise<Response>;
/* functions/api/qulf.ts Workers turlarini (PagesFunction) talab qiladi -- src tsconfig'iga tortmaslik uchun dinamik yo'l. */
const QULF_YOL = '../../functions/api/qulf';
let onRequestGet: H; let onRequestPost: H;
beforeAll(async () => { const m = await import(/* @vite-ignore */ QULF_YOL) as { onRequestGet: H; onRequestPost: H }; onRequestGet = m.onRequestGet; onRequestPost = m.onRequestPost; });

vi.mock('../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ globalRejim: true, joriy: null, superadmin: false }) }));
import { QulfBolimi } from './QulfBolimi';
import { QulfOyna } from './QulfOyna';

const KALIT = 'sinov-sessiya-kalit-0123456789abcdef';
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KALIT };
let sb: ReturnType<typeof soxtaSupabase>;
let cookie = '';
const bodies: Record<string, unknown>[] = [];

beforeEach(async () => {
  sb = soxtaSupabase(); bodies.length = 0;
  cookie = 'sess=' + await imzola({ rol: 'admin', foydalanuvchi_id: 17 }, KALIT, Date.now() - 3600_000);
  const supa = sb.fn;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const u = String(input);
    if (u.startsWith('https://x.supabase.co')) return supa(input, init);
    const url = new URL(u, 'https://qur.uz');
    const h = { Cookie: cookie, Origin: 'https://qur.uz', ...((init.headers as Record<string, string>) ?? {}) };
    if (init.body) bodies.push(JSON.parse(String(init.body)));
    const request = new Request(url, { method: init.method ?? 'GET', headers: h, body: init.body as string | undefined });
    return (init.method === 'POST' ? onRequestPost : onRequestGet)({ request, env });
  });
  vi.stubGlobal('PublicKeyCredential', undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const yoz = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

describe('QulfBolimi (PIN o\'rnatish) -> QulfOyna (qulf ochish): haqiqiy handler bilan', () => {
  it('4 raqamli PIN o\'rnatiladi; keyin tugmalar bilan ham, klaviatura bilan ham shu PIN o\'tadi', async () => {
    render(<QulfBolimi />);
    const yangi = await screen.findByLabelText('Yangi PIN') as HTMLInputElement;
    yoz(yangi, '1902'); yoz(screen.getByLabelText('PIN ni takrorlang'), '1902');
    fireEvent.click(screen.getByRole('button', { name: /PIN o.rnatish/ }));
    await waitFor(() => expect(sb.qator.get(17)?.pin_hash).toBeTruthy());
    expect(bodies.find((b) => b.amal === 'pin_saqla')).toEqual({ amal: 'pin_saqla', yangi: '1902' });
    cleanup();

    // tugmalar bilan
    const ochildi = vi.fn();
    render(<QulfOyna rejim="qulf" pinBor biometrik={false} onOchildi={ochildi} onChiqish={() => {}} />); // uzunlik noma'lum (eski xesh): OK tugmasi
    for (const d of ['1', '9', '0', '2']) fireEvent.click(screen.getByRole('button', { name: d }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(ochildi).toHaveBeenCalled());
    expect(bodies.filter((b) => b.amal === 'pin_tekshir').at(-1)).toEqual({ amal: 'pin_tekshir', pin: '1902' });
    cleanup();

    // klaviatura bilan + Enter
    const ochildi2 = vi.fn();
    render(<QulfOyna rejim="qulf" pinBor biometrik={false} pinUzunlik={4} onOchildi={ochildi2} onChiqish={() => {}} />);
    const d = screen.getByRole('dialog');
    for (const k of ['1', '9', '0', '2']) fireEvent.keyDown(d, { key: k });
    fireEvent.keyDown(d, { key: 'Enter' });
    await waitFor(() => expect(ochildi2).toHaveBeenCalled());
  });

  it('pinUzunlik ma\'lum: nuqtalar soni shuncha va oxirgi raqamdan keyin o\'zi yuboriladi (OK bosmasdan)', async () => {
    expect((await onRequestPost({ request: new Request('https://qur.uz/api/qulf', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://qur.uz' }, body: JSON.stringify({ amal: 'pin_saqla', yangi: '1902' }) }), env })).status).toBe(200);
    const ochildi = vi.fn();
    render(<QulfOyna rejim="qulf" pinBor biometrik={false} pinUzunlik={4} onOchildi={ochildi} onChiqish={() => {}} />);
    expect(screen.getByRole('status').children).toHaveLength(4);
    const d = screen.getByRole('dialog');
    for (const k of ['1', '9', '0', '2']) fireEvent.keyDown(d, { key: k });
    await waitFor(() => expect(ochildi).toHaveBeenCalled());
  });

  it('xato PIN: qolgan urinishlar ko\'rinadi; «PIN esdan chiqdi» va «Chiqish» doim bor', async () => {
    await onRequestPost({ request: new Request('https://qur.uz/api/qulf', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://qur.uz' }, body: JSON.stringify({ amal: 'pin_saqla', yangi: '1902' }) }), env });
    const chiq = vi.fn();
    render(<QulfOyna rejim="qulf" pinBor biometrik={false} pinUzunlik={4} onOchildi={() => {}} onChiqish={chiq} />);
    const d = screen.getByRole('dialog');
    for (const k of ['1', '1', '1', '1']) fireEvent.keyDown(d, { key: k });
    expect(await screen.findByText(/Qolgan urinishlar/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'PIN esdan chiqdi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chiqish' }));
    expect(chiq).toHaveBeenCalledTimes(2);
  });

  it('xavfsizlik klapani: server PIN_YOQ desa (qulf yoqilgan deb o\'ylagan mijoz) qulf ochiladi va onTutilgan chaqiriladi', async () => {
    const tutilgan = vi.fn(); const ochildi = vi.fn();
    render(<QulfOyna rejim="qulf" pinBor biometrik={false} pinUzunlik={4} onOchildi={ochildi} onTutilgan={tutilgan} onChiqish={() => {}} />);
    const d = screen.getByRole('dialog');
    for (const k of ['1', '9', '0', '2']) fireEvent.keyDown(d, { key: k });
    await waitFor(() => expect(tutilgan).toHaveBeenCalled());
    expect(ochildi).not.toHaveBeenCalled();
  });
});
