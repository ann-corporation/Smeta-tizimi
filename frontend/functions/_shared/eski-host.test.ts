import { describe, expect, it } from 'vitest';
import { eskiHostYonlantir } from './eski-host';
import { sessCookie } from './kirish-emailsiz';
import { saytUrl, miniAppUrl } from './telegram';
import { googleOriginlar } from './google-id';
import { rpVaOrigin } from './qulf-webauthn';
import { tekshirBazasi } from '../../src/lib/brend';
import { havolaOrigin, publicOrigin, saytOriginlar } from '../../src/lib/sayt-manzil';

const BRAUZER = { Accept: 'text/html,application/xhtml+xml', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-User': '?1', 'Sec-Fetch-Dest': 'document' };
const req = (url: string, headers: Record<string, string> = BRAUZER, method = 'GET') => new Request(url, { method, headers });
const OLD = 'https://smeta-tizimi.pages.dev';

describe('eski host → qurai.uz (301 faqat brauzer HTML sahifalari)', () => {
  it('bosh sahifa, SPA yo\'li va query bir xil saqlanadi', () => {
    const r = eskiHostYonlantir(req(`${OLD}/admin/obyektlar/12?tab=fakt&x=1`), {})!;
    expect(r.status).toBe(301);
    expect(r.headers.get('Location')).toBe('https://qurai.uz/admin/obyektlar/12?tab=fakt&x=1');
    expect(eskiHostYonlantir(req(`${OLD}/`), {})!.headers.get('Location')).toBe('https://qurai.uz/');
    expect(eskiHostYonlantir(req(`${OLD}/taklif/ABC`, BRAUZER, 'HEAD'), {})!.status).toBe(301);
  });
  it('PUBLIC_ORIGIN env ustun', () => {
    expect(eskiHostYonlantir(req(`${OLD}/x`), { PUBLIC_ORIGIN: 'https://staging.qurai.uz/' })!.headers.get('Location')).toBe('https://staging.qurai.uz/x');
  });
  it.each([
    '/api/kirish', '/api/telegram/webhook?x=1', '/api', '/mobile-release.json', '/desktop-release.json', '/t/ABCDE-12345', '/t',
    '/android/0.1.5/abc/qurai.apk', '/windows/x', '/macos/y', '/assets/app-1.js', '/brand/a.png', '/favicon.ico', '/sw.js', '/manifest.webmanifest',
    '/ilova-qaytdi?t=abc', '/brauzer-kirish?h=1', '/tg',
  ])('redirect QILINMAYDI: %s', (p) => {
    expect(eskiHostYonlantir(req(OLD + p), {})).toBeNull();
  });
  it('POST/PUT/webhook usullari o\'tkazib yuboriladi', () => {
    expect(eskiHostYonlantir(req(`${OLD}/admin`, BRAUZER, 'POST'), {})).toBeNull();
    expect(eskiHostYonlantir(req(`${OLD}/api/telegram/webhook`, BRAUZER, 'POST'), {})).toBeNull();
  });
  it('yangi host, preview host va localhost tegilmaydi', () => {
    expect(eskiHostYonlantir(req('https://qurai.uz/admin'), {})).toBeNull();
    expect(eskiHostYonlantir(req('https://abc123.smeta-tizimi.pages.dev/admin'), {})).toBeNull();
    expect(eskiHostYonlantir(req('http://localhost:8788/admin'), {})).toBeNull();
  });
  it('brauzer bo\'lmagan mijozlar: curl (Accept */*), fetch, iframe, Android WebView, dastur navigatsiyasi', () => {
    expect(eskiHostYonlantir(req(`${OLD}/admin`, { Accept: '*/*' }), {})).toBeNull();
    expect(eskiHostYonlantir(req(`${OLD}/admin`, { Accept: 'text/html', 'Sec-Fetch-Mode': 'cors' }), {})).toBeNull();
    expect(eskiHostYonlantir(req(`${OLD}/admin`, { ...BRAUZER, 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; wv) QURAIApp/0.1.5' }), {})).toBeNull();
    expect(eskiHostYonlantir(req(`${OLD}/admin`, { ...BRAUZER, 'X-Requested-With': 'uz.anncorp.smeta' }), {})).toBeNull();
    const { 'Sec-Fetch-User': _drop, ...skriptNav } = BRAUZER; void _drop; // eski Windows qobig'i location.replace — foydalanuvchi harakatisiz
    expect(eskiHostYonlantir(req(`${OLD}/admin`, skriptNav), {})).toBeNull();
  });
  it('Sec-Fetch sarlavhasiz eski brauzer yo\'naltiriladi', () => {
    expect(eskiHostYonlantir(req(`${OLD}/admin`, { Accept: 'text/html' }), {})!.status).toBe(301);
  });
  it('o\'chirgich ESKI_HOST_YONLANTIRISH=0 va sikldan himoya', () => {
    expect(eskiHostYonlantir(req(`${OLD}/admin`), { ESKI_HOST_YONLANTIRISH: '0' })).toBeNull();
    expect(eskiHostYonlantir(req(`${OLD}/admin`), { PUBLIC_ORIGIN: OLD })).toBeNull();
  });
});

describe('domen manbalari: kanonik qurai.uz, eski host o\'tish davrida qabul qilinadi', () => {
  it('publicOrigin / saytOriginlar', () => {
    expect(publicOrigin({})).toBe('https://qurai.uz');
    expect(publicOrigin({ PUBLIC_ORIGIN: 'https://qurai.uz/' })).toBe('https://qurai.uz');
    expect(publicOrigin({ PUBLIC_ORIGIN: 'http://evil' })).toBe('https://qurai.uz');
    expect(saytOriginlar({})).toEqual(['https://qurai.uz', OLD]);
  });
  it('havola/QR bazasi: eski hostdan kelsa kanonik, preview va BREND_URL o\'zgarishsiz', () => {
    expect(havolaOrigin({}, `${OLD}/api/x`)).toBe('https://qurai.uz');
    expect(havolaOrigin({}, 'https://x.pages.dev/api')).toBe('https://x.pages.dev');
    expect(tekshirBazasi({ BREND_URL: 'https://qurai.uz' }, `${OLD}/api/x`)).toBe('https://qurai.uz');
    expect(tekshirBazasi({ PUBLIC_ORIGIN: 'https://qurai.uz' }, 'http://localhost:8788/x')).toBe('https://qurai.uz');
    expect(tekshirBazasi({}, 'http://localhost:8788/x')).toBe('http://localhost:8788');
  });
  it('Telegram Mini App/webhook bazasi', () => {
    expect(saytUrl({})).toBe('https://qurai.uz');
    expect(miniAppUrl({})).toBe('https://qurai.uz/tg');
    expect(saytUrl({ PUBLIC_ORIGIN: 'https://staging.qurai.uz' })).toBe('https://staging.qurai.uz');
    expect(saytUrl({ TELEGRAM_SAYT_URL: 'https://x.example/', PUBLIC_ORIGIN: 'https://qurai.uz' })).toBe('https://x.example');
  });
  it('Google originlar: sukut kanonik + eski; GOOGLE_ORIGINS ustun', () => {
    expect(googleOriginlar({})).toEqual(['https://qurai.uz', OLD]);
    expect(googleOriginlar({ GOOGLE_ORIGINS: 'https://a.example' })).toEqual(['https://a.example']);
  });
  it('WebAuthn: rpId env, originlar so\'rov + QULF_ORIGINS (eski host o\'tish davrida ro\'yxatda)', () => {
    const r = rpVaOrigin('https://qurai.uz/api/qulf', { QULF_RP_ID: 'qurai.uz', QULF_ORIGINS: `https://qurai.uz,https://www.qurai.uz,${OLD}` });
    expect(r.rpId).toBe('qurai.uz');
    expect(r.origins).toContain(OLD);
    expect(rpVaOrigin(`${OLD}/api/qulf`, {}).rpId).toBe('smeta-tizimi.pages.dev'); // env yo'q — har host o'zinikida ishlaydi
  });
  it('sessiya cookie HOST-ONLY: Domain atributi yo\'q (qurai.uz da bir marta qayta kirish)', () => {
    expect(sessCookie('tok')).not.toMatch(/domain=/i);
    expect(sessCookie('tok')).toMatch(/HttpOnly; Secure; SameSite=Lax; Path=\//);
  });
});