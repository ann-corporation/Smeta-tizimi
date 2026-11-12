import { describe, expect, it } from 'vitest';
import { narxTakliflari, type ManbaMeta, type ManbaQator } from './narx-taklif';
import { qqsSizNarx } from '../hisob-yadro';

const meta = new Map<number, ManbaMeta>([
  [1, { id: 1, nom: 'Shartnoma A', raqam: '12', sana: '2026-01-05', tur: 'shartnoma', nds_holati: 'nds_bilan' }],
  [2, { id: 2, nom: 'Bozor', raqam: null, sana: null, tur: 'bozor', nds_holati: 'nds_siz' }],
  [3, { id: 3, nom: 'Noma‘lum NDS', raqam: null, sana: null, tur: 'bozor', nds_holati: 'nomalum' }],
]);
const q = (id: number, manba_id: number, nom: string, birlik: string | null, narx: number | null): ManbaQator => ({ id, manba_id, nom, birlik, narx });

describe('narx manbalaridan taklif (read-only, manba bilan)', () => {
  it('NDS bilan manba QQS sizga keltiriladi; manba nomi/raqami/sanasi ko‘rinadi', () => {
    const r = narxTakliflari({ nom: 'Монолитная железобетонная плита перекрытия', birlik: 'м3' }, [q(1, 1, 'Плита железобетонная монолитная перекрытия', 'м3', 1_120_000)], meta);
    expect(r).toHaveLength(1); expect(r[0].narxQQSsiz).toBe(qqsSizNarx(1_120_000, 12)); expect(r[0].manba).toBe('Shartnoma A · 12 · 2026-01-05'); expect(r[0].ndsdan).toBe(true);
  });
  it('birlik koeffitsiyenti: 100 м3 narxi 1 м3 ga keltiriladi; boshqa baza birlik tashlanadi', () => {
    const r = narxTakliflari({ nom: 'Бетон монолитный фундаментов ленточных', birlik: 'м3' }, [q(2, 2, 'Бетон монолитный фундаментов ленточных', '100 м3', 50_000_000), q(3, 2, 'Бетон монолитный фундаментов ленточных', 'м2', 10)], meta);
    expect(r).toHaveLength(1); expect(r[0].narxQQSsiz).toBe(500_000);
  });
  it('NDS holati noma‘lum, narxsiz yoki mos kelmaydigan qator — taklif qilinmaydi (0/o‘ylab topish yo‘q)', () => {
    expect(narxTakliflari({ nom: 'Бетон монолитный фундаментов', birlik: 'м3' }, [q(4, 3, 'Бетон монолитный фундаментов', 'м3', 1), q(5, 2, 'Бетон монолитный фундаментов', 'м3', null), q(6, 2, 'Окна пластиковые', 'м3', 5)], meta)).toEqual([]);
  });
});
