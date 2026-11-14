import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAHIFALAR } from '../reestr/sahifa';
import { AMALLAR, quraRpc } from '../../../functions/_shared/yuk-tashish';
import { ilovaDarvozasi } from '../../../functions/_shared/ilova-darvoza';
import { yukSlotAjrat, yukSlotUrl } from '../yordamchi/yuk-slot';
import { narxP2, narxP2Parametr } from './narx-p2';

const OP = '123e4567-e89b-42d3-a456-426614174000';

/** Yakka foydalanuvchi (kompaniyasiz) yo'li: /yuk -> kirish/ro'yxat -> haydovchi sahifasi -> gateway; /admin smeta ma'lumotiga yo'l yo'q. */
describe('tashqi (yakka) foydalanuvchi yo‘li', () => {
  it('/yuk ochiq marshrut (admin tashqarisida) va haydovchi sahifasi ro‘yxatdan o‘tgan har kimga ochiq (ruxsat [], shaxsiy qatlam)', () => {
    const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(app).toMatch(/<Route path="\/yuk" element=/);
    const h = SAHIFALAR.find((s) => s.kalit === 'haydovchi');
    expect(h?.ruxsat).toEqual([]);
    expect(h?.navGuruh).toBe('shaxsiy');
  });
  it('haydovchi amallari kompaniyasiz ishlaydi; yuk egasi amallari kompaniya talab qiladi', () => {
    for (const amal of ['profil', 'reys', 'yaqin', 'saqla', 'holat', 'qabul', 'qadam', 'dalil', 'joy', 'park']) {
      const q = quraRpc(amal, 77, { operation_id: OP, data: { bron_id: 1, yuk_id: 1, qadam: 'keldi', tur: 'yuklash', r2_kalit: 'yb/u77/x.jpg', ism: 'A' } });
      expect(q.ok, amal).toBe(true);
      if (q.ok) { expect(q.ega, amal).toBe(false); expect(q.body.p_actor_id).toBe(77); expect(q.body).not.toHaveProperty('p_kompaniya_id'); }
    }
    for (const amal of ['ega_kuzat', 'yuk_qosh', 'buyurtma_yuklar']) {
      expect(quraRpc(amal, 77, { operation_id: OP, data: { yuk_id: 1 } }), amal).toEqual({ ok: false, code: 'KOMPANIYA_KERAK' });
    }
  });
  it('smeta ma‘lumotiga yo‘l yo‘q: faqat t2_yb_* RPC lar, tanada obyekt/qator kaliti qabul qilinmaydi', () => {
    for (const a of Object.values(AMALLAR)) { expect(a.rpc).toMatch(/^t2_yb_/); expect(a.kalit.join(',')).not.toMatch(/obyekt|qator|smeta|f2/); }
    const q = quraRpc('saqla', 5, { operation_id: OP, data: { ism: 'A', obyekt_id: 9, qator_id: 1 } });
    expect(q.ok && q.body.p_data).toEqual({ ism: 'A' });
  });
  it('ilova darvozasi kompaniyasiz foydalanuvchini to‘smaydi', async () => {
    const env = { SUPABASE_URL: 'https://x.invalid', SUPABASE_KEY: 'k' } as unknown as Parameters<typeof ilovaDarvozasi>[0];
    expect(await ilovaDarvozasi(env, { foydalanuvchi_id: 5, rol: 'pto' }, 'logistika', undefined)).toBeNull();
  });
});

describe('Jarvis naqsh slotlari (model chaqirilmaydi)', () => {
  it('«5 tonna sement uchun Navoiydan Toshkentga mashina top»', () => {
    const s = yukSlotAjrat('5 tonna sement uchun Navoiydan Toshkentga mashina top');
    expect(s).toEqual({ nom: 'Sement', tonna: 5, a: 'Navoiy', b: 'Toshkent' });
    expect(yukSlotUrl(s!)).toBe('/admin/yuk-chaqirish?nom=Sement&tonna=5&a_nom=Navoiy&b_nom=Toshkent');
  });
  it('faqat tonna va yuk: manzilsiz ham forma ochiladi; boshqa gap — null', () => {
    expect(yukSlotAjrat('5 tonna sement uchun mashina top')).toMatchObject({ nom: 'Sement', tonna: 5, a: null, b: null });
    expect(yukSlotAjrat('f2 qoralama yarat')).toBeNull();
  });
});

describe('narx formulasi (ma‘lumot, taxminiy default)', () => {
  const p = narxP2Parametr({ narx_baza: 50000, narx_km_sinf: { katta: 9500, orta: 6500 }, yuklash_narx: 80000, kutish_soat_narx: 40000 });
  it('baza + km×stavka (+ yuklash + kutish); QQS siz', () => {
    expect(narxP2({ km: 100, sinf: 'katta' }, p).qqsSiz).toBe(50000 + 100 * 9500);
    expect(narxP2({ km: 100, sinf: 'katta', yuklashKerak: true, kutishSoat: 2 }, p).qqsSiz).toBe(50000 + 950000 + 80000 + 80000);
  });
  it('yetishmasa narx yo‘q («—», 0 emas)', () => {
    const n = narxP2({ km: null, sinf: 'katta' }, p);
    expect(n.qqsSiz).toBeNull(); expect(n.yetishmaydi).toContain('masofa');
    expect(narxP2({ km: 10, sinf: 'katta' }, narxP2Parametr(null)).qqsSiz).toBeNull();
  });
});
