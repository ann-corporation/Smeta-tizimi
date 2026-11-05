import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { avvalgiBilanF2Qoldiq, avvalgiF2Xaritasi, kochmaganBor, type F2KochirmaQator, type F2VersiyaKochirma } from './f2-versiya-kochirma';

const q = (x: Partial<F2KochirmaQator> & { qator_id: number }): F2KochirmaQator => ({
  f2_avvalgi_hajm: null, f2_avvalgi_summa: null, f2_avvalgi_summa_nomalum: 0, eski_soni: 1, akt_idlar: [], eski_qator_idlar: [],
  moslik_id: null, zanjir_qadam: 1, ...x,
});
const jami = (x: Partial<F2VersiyaKochirma['jami']> = {}): F2VersiyaKochirma['jami'] => ({
  eski_soni: 0, eski_summa: 0, eski_summa_nomalum: 0, kochdi_soni: 0, kochdi_summa: 0, kutilmoqda_soni: 0, kutilmoqda_summa: 0,
  moslanmagan_soni: 0, moslanmagan_summa: 0, sabablar: {}, ...x,
});

describe('F2 versiya ko‘chirmasi — ko‘rsatish qatlami', () => {
  it('xarita: server qatorlari → faol qator id; sof 0 tashlanadi; NULL summa null qoladi (0 emas)', () => {
    const m = avvalgiF2Xaritasi({ qatorlar: [
      q({ qator_id: 43, f2_avvalgi_hajm: 4, f2_avvalgi_summa: 400 }),
      q({ qator_id: 45, f2_avvalgi_hajm: '3' as unknown as number, f2_avvalgi_summa: null, f2_avvalgi_summa_nomalum: 1 }),
      q({ qator_id: 50, f2_avvalgi_hajm: 0, f2_avvalgi_summa: 0 }),
    ] });
    expect([...m.keys()]).toEqual([43, 45]);
    expect(m.get(43)).toEqual({ hajm: 4, summa: 400, summaNomalum: 0, eskiSoni: 1 });
    expect(m.get(45)).toEqual({ hajm: 3, summa: null, summaNomalum: 1, eskiSoni: 1 });
    expect(avvalgiF2Xaritasi(null).size).toBe(0);
  });

  it('F2 qoldig‘i belgisi yagona ochiqQoldiq (F2 rejimi) orqali: smeta − (o‘z F2 + avvalgi) − almashtirilgan', () => {
    const av = { hajm: 4, summa: 400, summaNomalum: 0, eskiSoni: 1 };
    expect(avvalgiBilanF2Qoldiq({ smeta: 8, ozF2: 1, avvalgi: av })).toBe(3);
    expect(avvalgiBilanF2Qoldiq({ smeta: 8, ozF2: 0, avvalgi: av, almashtirilgan: 2 })).toBe(2);
    expect(avvalgiBilanF2Qoldiq({ smeta: null, ozF2: 0, avvalgi: av })).toBeNull();
    expect(avvalgiBilanF2Qoldiq({ smeta: 8, ozF2: 0, avvalgi: null })).toBeNull();
  });

  it('ko‘chmagan eski F2 ogohi: kutilmoqda yoki moslanmagan bo‘lsa', () => {
    expect(kochmaganBor(null)).toBe(false);
    expect(kochmaganBor({ jami: jami({ kochdi_soni: 3 }) })).toBe(false);
    expect(kochmaganBor({ jami: jami({ kutilmoqda_soni: 1 }) })).toBe(true);
    expect(kochmaganBor({ jami: jami({ moslanmagan_soni: 2 }) })).toBe(true);
  });
});

describe('20261203001000 migratsiyasi — tuzilma qo‘riqchisi', () => {
  const dir = resolve(__dirname, '../../../supabase/migrations');
  const nom = '20261203001000_t2_f2_versiya_kochirma_v1';
  const migr = readFileSync(resolve(dir, `${nom}.sql`), 'utf8');
  const acc = readFileSync(resolve(dir, `${nom}.acceptance.sql`), 'utf8');
  const rb = readFileSync(resolve(dir, `${nom}.rollback.sql`), 'utf8');
  const sb = readFileSync(resolve(__dirname, '../../functions/api/sb.ts'), 'utf8');

  it('faqat o‘qish: stable security definer, qat’iy search_path, a’zolik + f2.read, faqat service_role', () => {
    expect(migr).toMatch(/returns jsonb language plpgsql stable security definer set search_path = public, pg_temp/);
    expect(migr).toMatch(/t2_actor_kompaniya_azo_tekshir\(v_k, p_actor_id\)/);
    expect(migr).toMatch(/t2_require_permission_v2\(v_k, p_actor_id, 'f2\.read'\)/);
    expect(migr).toMatch(/revoke all on function public\.t2_f2_versiya_kochirma_v1\(bigint, bigint\) from public, anon, authenticated/);
    expect(migr).toMatch(/grant execute on function public\.t2_f2_versiya_kochirma_v1\(bigint, bigint\) to service_role/);
    expect(migr).not.toMatch(/\b(insert into|update public\.|delete from)\b/i);
  });

  it('F2 qiymati t2_qator_holat bilan bir xil manbadan: certified ustun, faqat tasdiqlangan F2', () => {
    expect(migr).toMatch(/coalesce\(aq\.certified_quantity, aq\.hajm\)/);
    expect(migr).toMatch(/coalesce\(aq\.certified_amount, aq\.summa\)/);
    expect(migr).toMatch(/a\.tur = 'f2' and a\.holat = 'tasdiqlangan'/);
  });

  it('qabul: sintetik, BEGIN…ROLLBACK, PASS notice, oddiy a’zo bilan tenant tekshiruvi; rollback funksiyani olib tashlaydi', () => {
    expect(acc).toMatch(/^begin;/m);
    expect(acc.trim().endsWith('rollback;')).toBe(true);
    expect(acc).toMatch(/F2_VERSIYA_KOCHIRMA_ACCEPTANCE_PASS/);
    expect(acc).toMatch(/t2_platforma_superadmin\(a\) or public\.t2_platforma_superadmin\(b\)/);
    expect(acc).toMatch(/t2_f2_versiya_kochirma_v1\(o, b\)/);
    expect(rb).toMatch(/drop function if exists public\.t2_f2_versiya_kochirma_v1\(bigint, bigint\)/);
  });

  it('BFF: o‘qish allowlistida obyekt_actor (p_actor_id sessiyadan)', () => {
    expect(sb).toMatch(/f2_versiya_kochirma_v1: 'obyekt_actor'/);
  });
});
