import { describe, expect, it, vi } from 'vitest';
import { bittaYetkaz, doimiyRadmi, telegramMatni, vaqtinchalikmi, xulosa, yetkazPartiya, type Bogliqlik, type NavbatQator } from './bildirishnoma-yetkaz';
import { BILDIRISHNOMA_MATN, bildirishnomaHavolasi, muddatKorinishi } from '../../src/lib/bildirishnoma-matn';
import lugat from '../../src/i18n/lugat/qism/bildirishnoma.json';

const q = (id: number, o: Partial<NavbatQator> = {}): NavbatQator => ({ id, foydalanuvchi_id: 10 + id, mavzu: 'hujjat.muddat_yaqin', parametrlar: { xat_id: 5, muddat: '2026-11-07' }, urinish: 1, ...o });
const dep = (o: Partial<Bogliqlik> = {}): Bogliqlik & { yubor: ReturnType<typeof vi.fn> } => ({
  manzil: vi.fn(async () => ({ yuborish: true, chat_id: 777, til: 'ru' as const })),
  yubor: vi.fn(async () => ({ ok: true })),
  ...o,
}) as never;

describe('bildirishnoma matni va havolasi', () => {
  it('har mavzu matnining ru/en tarjimasi bor', () => {
    const L = lugat as Record<string, { ru?: string; en?: string }>;
    for (const k of [...Object.values(BILDIRISHNOMA_MATN), 'Muddat: {muddat}', 'Hujjatni ochish']) {
      expect(L[k]?.ru, k).toBeTruthy(); expect(L[k]?.en, k).toBeTruthy();
    }
  });
  it('Telegram matni tilda, muddat va raqam bilan; noma’lum mavzu — null', () => {
    expect(telegramMatni(q(1), 'uz')).toBe('Hujjat muddati yaqinlashmoqda\nMuddat: 07.11.2026');
    expect(telegramMatni(q(1), 'ru')).toBe('Срок по документу истекает\nСрок: 07.11.2026');
    expect(telegramMatni({ mavzu: 'hujjat.xat_keldi', parametrlar: { raqam: 'CH-12' } }, 'en')).toBe('You have received a new letter — № CH-12');
    expect(telegramMatni({ mavzu: 'topshiriq.yangi', parametrlar: {} }, 'uz')).toBeNull();
  });
  it('havola hujjatning o‘zini ochadi', () => {
    expect(bildirishnomaHavolasi({ mavzu: 'hujjat.muddat_otdi', parametrlar: { xat_id: 9 } })).toBe('/admin/hujjat-aylanish?xat=9');
    expect(bildirishnomaHavolasi({ mavzu: 'hujjat.tasdiq_kutmoqda', parametrlar: { zanjir_id: '4' } })).toBe('/admin/hujjat-aylanish?zanjir=4');
    expect(bildirishnomaHavolasi({ mavzu: 'hujjat.muddat_yaqin', parametrlar: { murojaat_id: 3 } })).toBe('/admin/murojaatlar');
    expect(bildirishnomaHavolasi({ mavzu: 'hujjat.muddat_yaqin', parametrlar: { xat_id: -1 } })).toBe('/admin/hujjat-aylanish');
    expect(bildirishnomaHavolasi({ havola: '/admin/x', mavzu: 'hujjat.xat_keldi', parametrlar: { xat_id: 1 } })).toBe('/admin/x');
    expect(muddatKorinishi(null)).toBeNull();
  });
});

describe('Telegram yetkazish natijasi (qayta yubormaslik)', () => {
  it('yuborildi — matn, chat va havola uzatiladi', async () => {
    const d = dep();
    expect(await bittaYetkaz(q(1), d)).toEqual({ id: 1, holat: 'yuborildi' });
    expect(d.yubor).toHaveBeenCalledWith(777, 'Срок по документу истекает\nСрок: 07.11.2026', 'ru', '/admin/hujjat-aylanish?xat=5');
  });
  it('ulanmagan yoki rozi emas — otkazildi, yuborilmaydi', async () => {
    const d = dep({ manzil: vi.fn(async () => ({ yuborish: false })) });
    expect((await bittaYetkaz(q(1), d)).holat).toBe('otkazildi');
    expect(d.yubor).not.toHaveBeenCalled();
  });
  it('manzil aniqlanmadi (baza xatosi) — xato (qayta urinish xavfsiz, xabar ketmagan)', async () => {
    const d = dep({ manzil: vi.fn(async () => null) });
    expect(await bittaYetkaz(q(1), d)).toMatchObject({ holat: 'xato', xato: 'MANZIL_ANIQLANMADI' });
    expect(d.yubor).not.toHaveBeenCalled();
    const d2 = dep({ manzil: vi.fn(async () => { throw new Error('x'); }) });
    expect((await bittaYetkaz(q(1), d2)).holat).toBe('xato');
  });
  it('bot bloklangan / chat yo‘q — otkazildi (doimiy)', async () => {
    const d = dep({ yubor: vi.fn(async () => ({ ok: false, description: 'Forbidden: bot was blocked by the user' })) });
    expect((await bittaYetkaz(q(1), d)).holat).toBe('otkazildi');
    expect(doimiyRadmi('Bad Request: chat not found')).toBe(true);
  });
  it('429 / 5xx — xato (Telegram aniq rad etdi, keyin qayta)', async () => {
    const d = dep({ yubor: vi.fn(async () => ({ ok: false, description: 'Too Many Requests: retry after 5' })) });
    expect((await bittaYetkaz(q(1), d)).holat).toBe('xato');
    expect(vaqtinchalikmi('Internal Server Error')).toBe(true);
  });
  it('token yo‘q (so‘rov ketmagan) — xato', async () => {
    const d = dep({ yubor: vi.fn(async () => ({ ok: false, description: 'TOKEN_YOQ', yetdi: false })) });
    expect((await bittaYetkaz(q(1), d)).holat).toBe('xato');
  });
  it('tarmoq uzildi / tushunarsiz javob — nomalum (ketgan bo‘lishi mumkin: QAYTA YUBORILMAYDI)', async () => {
    for (const y of [async () => ({ ok: false, description: 'TARMOQ' }), async () => { throw new Error('reset'); }, async () => ({ ok: false })]) {
      expect((await bittaYetkaz(q(1), dep({ yubor: vi.fn(y) }))).holat).toBe('nomalum');
    }
  });
  it('noma’lum mavzu — otkazildi, yuborilmaydi', async () => {
    const d = dep();
    expect((await bittaYetkaz(q(1, { mavzu: 'hujjat.yangi_tur' }), d)).holat).toBe('otkazildi');
    expect(d.yubor).not.toHaveBeenCalled();
  });
  it('partiya: bir id ikki marta kelsa ham bir marta yuboriladi; xulosa sonlari', async () => {
    const d = dep({ manzil: vi.fn(async (u: number) => (u === 12 ? { yuborish: false } : { yuborish: true, chat_id: u, til: null })) });
    const n = await yetkazPartiya([q(1), q(1), q(2), q(3)], d);
    expect(n.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(d.yubor).toHaveBeenCalledTimes(2);
    expect(xulosa(n)).toEqual({ yuborildi: 2, xato: 0, otkazildi: 1, nomalum: 0 });
  });
});
