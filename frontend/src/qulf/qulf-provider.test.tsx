// @vitest-environment jsdom
/**
 * QulfProvider stsenariylari (2026-11-16 egasi tuzog'i): PINsiz biometrik qulf, Tauri/rpId mos kelmasligi, eski faollik vaqti (kirgan zahoti qulf), o'chirgich.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QulfProvider } from './QulfProvider';
import { SESSIYA_GRACE_MS, biometrikIshlaydi, qulfKerakmi, yangiSessiyami } from './mantiq';

const SOAT = 3600_000;
const kalit = { id: 1, tur: 'webauthn', nom: 'Windows Hello', yaratildi: '2026-11-15T20:38:00Z', oxirgi: null };
let holat: Record<string, unknown>;

function ornat(h: Record<string, unknown>, ls: Record<string, string> = {}) {
  holat = { ok: true, pin_bor: false, bosh_vaqt_daq: 10, kalitlar: [], rejim: 'pin', talab: false, usullar: [], pin_holat: 'ok', qolgan_soniya: 0, qolgan_urinish: 5, rp_id: 'qur.uz', sessiya_iat: Date.now() - 1000, ...h };
  for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(holat), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}
const eskiLs = () => ({ 'qulf.oxirgi': String(Date.now() - 5 * SOAT), 'qulf.qulf': '1', 'qulf.yoqilgan': '1', 'qulf.daq': '10' });
const dialog = () => screen.queryByRole('dialog');
const chiz = () => render(<QulfProvider><p>kontent</p></QulfProvider>);

beforeEach(() => { localStorage.clear(); delete (window as unknown as { __TAURI__?: unknown }).__TAURI__; vi.stubGlobal('PublicKeyCredential', function PK() {}); Object.defineProperty(navigator, 'credentials', { value: { get: async () => null, create: async () => null }, configurable: true }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('QulfProvider: tuzoqqa tushmaslik', () => {
  it('PINsiz biometrik kalit: qulf YOQILMAYDI (zaxira yo\'q), eski qulf bayrog\'i ham olib tashlanadi', async () => {
    ornat({ pin_bor: false, kalitlar: [kalit], qulf_yoqilgan: false, kalit_pinsiz: true }, eskiLs());
    chiz();
    await waitFor(() => expect(localStorage.getItem('qulf.yoqilgan')).toBeNull());
    expect(dialog()).toBeNull();
    expect(screen.getByText('kontent')).toBeTruthy();
  });

  it('eski faollik vaqti + yangi kirish (sessiya_iat yangi): kirgan zahoti qulflanmaydi', async () => {
    ornat({ pin_bor: true, pin_uzunlik: 4, kalitlar: [kalit], qulf_yoqilgan: true }, eskiLs());
    chiz();
    await waitFor(() => expect(localStorage.getItem('qulf.sessiya')).toBeTruthy());
    expect(dialog()).toBeNull();
    expect(localStorage.getItem('qulf.qulf')).toBeNull();
  });

  it('o\'chirgich / siyosat off (qulf_yoqilgan=false): PIN bor bo\'lsa ham qulf yo\'q', async () => {
    ornat({ pin_bor: true, qulf_yoqilgan: false }, eskiLs());
    chiz();
    await waitFor(() => expect(localStorage.getItem('qulf.yoqilgan')).toBeNull());
    expect(dialog()).toBeNull();
  });

  it('Tauri qobig\'i: biometrik ko\'rsatilmaydi, PIN klaviaturasi + «PIN esdan chiqdi» + «Chiqish» bor', async () => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {};
    ornat({ pin_bor: true, pin_uzunlik: 4, kalitlar: [kalit], qulf_yoqilgan: true, sessiya_iat: 1 }, { ...eskiLs(), 'qulf.sessiya': '5' });
    chiz();
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy();
    expect(screen.queryByText('Biometrik bilan ochish')).toBeNull();
    expect(screen.getByRole('button', { name: 'PIN esdan chiqdi' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chiqish' })).toBeTruthy();
  });

  it('rpId shu domenga mos kelmasa biometrik yo\'q, PIN bor; mos bo\'lsa biometrik ham bor', async () => {
    ornat({ pin_bor: true, pin_uzunlik: 4, kalitlar: [kalit], qulf_yoqilgan: true, rp_id: 'boshqa.example', sessiya_iat: 1 }, { ...eskiLs(), 'qulf.sessiya': '5' });
    chiz();
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy();
    expect(screen.queryByText('Biometrik bilan ochish')).toBeNull();
  });

  it('eski faollik vaqti, LEKIN yangi kirish emas (sessiya_iat saqlangan): qulflanadi (maxfiylik) -- PIN klaviaturasi bilan', async () => {
    ornat({ pin_bor: true, pin_uzunlik: 4, qulf_yoqilgan: true, sessiya_iat: 1 }, { ...eskiLs(), 'qulf.sessiya': '5' });
    chiz();
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy();
  });
});

describe('mantiq', () => {
  it('biometrikIshlaydi: PINsiz, Tauri, rpId farqi, WebAuthn yo\'q -> false; to\'g\'ri yuza -> true', () => {
    const b = { pinBor: true, webauthnKalit: true, rpId: 'qur.uz', hostname: 'qur.uz', tauri: false, webauthnMavjud: true };
    expect(biometrikIshlaydi(b)).toBe(true);
    expect(biometrikIshlaydi({ ...b, hostname: 'app.qur.uz' })).toBe(true);
    expect(biometrikIshlaydi({ ...b, pinBor: false })).toBe(false);
    expect(biometrikIshlaydi({ ...b, tauri: true })).toBe(false);
    expect(biometrikIshlaydi({ ...b, hostname: 'tauri.localhost' })).toBe(false);
    expect(biometrikIshlaydi({ ...b, hostname: 'evilqur.uz' })).toBe(false);
    expect(biometrikIshlaydi({ ...b, webauthnMavjud: false })).toBe(false);
    expect(biometrikIshlaydi({ ...b, rpId: undefined })).toBe(false);
  });
  it('qulfKerakmi: kirishdan keyin grace ichida hech qachon, undan keyin eski faollik bo\'yicha', () => {
    const hozir = 1_000_000_000_000;
    const s = { yoqilgan: true, oxirgiFaol: hozir - 5 * SOAT, yashirinBoshi: null, hozir, daqiqa: 10 };
    expect(qulfKerakmi(s)).toBe(true);
    expect(qulfKerakmi({ ...s, sessiyaBoshi: hozir - 1000 })).toBe(false);
    expect(qulfKerakmi({ ...s, sessiyaBoshi: hozir - SESSIYA_GRACE_MS - 1 })).toBe(true);
  });
  it('yangiSessiyami', () => { expect(yangiSessiyami(10, 5)).toBe(true); expect(yangiSessiyami(5, 5)).toBe(false); expect(yangiSessiyami(undefined, 5)).toBe(false); });
});