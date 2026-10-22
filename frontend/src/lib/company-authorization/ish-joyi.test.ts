import { describe, expect, it } from 'vitest';
import { kodXeshi, yangiKod, yozishYuki } from '../../../functions/_shared/ish-joyi-yuk';
import { kodniAjrat } from '../../umumiy/kontekst/IshJoyiAmallari';
import { taklifHavolasi } from '../../api/t2-ish-joyi';

/** Tomon kodi xeshi (tomon.ts bilan bir xil formula) — Pages handlerni brauzer typecheck'iga olib kirmaslik uchun shu yerda. */
async function tomonKodXeshi(kod: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tomon-taklif:' + kod.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* «Telegram modeli» (egasi 2026-10-22): ish joyi darhol ochiladi; havola orqali tasdiqsiz qo'shiladi; boss/admin havola bilan berilmaydi. */
describe('ish joyi shlyuzi', () => {
  it('havola orqali rahbar (boss) / admin / superadmin berilmaydi; muddat va soni chegarada', () => {
    for (const rol of ['boss', 'admin', 'superadmin', '']) expect(typeof yozishYuki('taklif_yarat', { kompaniya_id: 17, rol })).toBe('string');
    expect(yozishYuki('taklif_yarat', { kompaniya_id: 17, rol: 'pto', muddat_soat: 0 })).toMatch(/Muddat/);
    expect(yozishYuki('taklif_yarat', { kompaniya_id: 17, rol: 'pto', max_soni: 501 })).toMatch(/soni/);
    expect(yozishYuki('taklif_yarat', { kompaniya_id: 17, rol: 'pto' })).toMatchObject({ rpc: 't2_ish_joyi_taklif_yarat_v1', yuk: { p_rol: 'pto', p_muddat_soat: 72, p_max_soni: 1 } });
  });
  it('yangi ish joyi: nom va turi majburiy; actor yukda YO‘Q (faqat sessiyadan qo‘shiladi)', () => {
    expect(yozishYuki('yarat', { nom: 'A', turi: 'tashkilot' })).toMatch(/nomi/);
    expect(yozishYuki('yarat', { nom: 'Mening PTO', turi: 'boshqa' })).toMatch(/Turi/);
    const y = yozishYuki('yarat', { nom: '  Mening   PTO ', turi: 'shaxsiy', p_actor_id: 999 });
    expect(y).toMatchObject({ rpc: 't2_ish_joyi_yarat_v1', yuk: { p_nom: 'Mening PTO', p_turi: 'shaxsiy' } });
    expect((y as { yuk: Record<string, unknown> }).yuk.p_actor_id).toBeUndefined();
    expect(yozishYuki('nomalum', {})).toBe('Amal ochiq emas');
  });
  it('kod: o‘xshash belgilarsiz; xesh tomon kodlaridan ajratilgan; registr va chiziqcha farq qilmaydi', async () => {
    const k = yangiKod();
    expect(k).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    expect(await kodXeshi(k)).toBe(await kodXeshi(k.toLowerCase().replace(/-/g, '')));
    expect(await kodXeshi(k)).not.toBe(await tomonKodXeshi(k));
    expect(await kodXeshi(k)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('havola ↔ kod', () => {
    const h = taklifHavolasi('ABCDE-FGHJK-MNPQR', 'https://smeta-tizimi.pages.dev');
    expect(h).toBe('https://smeta-tizimi.pages.dev/qoshil/ABCDE-FGHJK-MNPQR');
    expect(kodniAjrat(h)).toBe('ABCDE-FGHJK-MNPQR');
    expect(kodniAjrat(' abcde-fghjk-mnpqr ')).toBe('ABCDE-FGHJK-MNPQR');
  });
});
