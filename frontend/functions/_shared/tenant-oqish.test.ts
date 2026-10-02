import { describe, expect, it } from 'vitest';
import type { Sess } from './auth';
import { OQISH_SIYOSATI, oqishQarori, rpcKompaniyasi } from './tenant-oqish';

/* Egasi (2026-10-02): "man NTB ning PTO si bo'la turib hech qachon tasodifan ham Discover Invest ning hujjatlarini
 * ko'rishim kerak emas". NTB = 17, Discover Invest = 99 (sinov). Har yo'l — rad yoki NTB bilan cheklangan. */
const NTB = 17;
const DISCOVER = 99;
const pto = (komp: number[] = [NTB]): Sess => ({ rol: 'pto', exp: Date.now() + 1e6, jti: 'x', foydalanuvchi_id: 5, kompaniyalar: komp.map((k) => ({ kompaniya_id: k, rol: 'pto' })) });

describe('O‘qish izolyatsiyasi (NTB ↔ Discover Invest)', () => {
  // sb.ts RUXSAT_JADVALLAR = OQISH_SIYOSATI kalitlari — testlar/t2_tenant_izolyatsiya.test.cjs da (Node fayl o'qish).
  it('har siyosat turi aniq', () => {
    expect(Object.values(OQISH_SIYOSATI).every((s) => ['kompaniya', 'platforma', 'ozi', 'global', 'superadmin', 'ota'].includes(s.tur))).toBe(true);
  });

  it('kompaniya jadvali: filtrsiz, id bo‘yicha, boshqa ustun bo‘yicha — hammasiga NTB filtri majburan qo‘shiladi', () => {
    for (const filtr of ['', 'id=eq.5', 'akt_id=eq.249', 'obyekt_id=in.(80,81)', `kompaniya_id=in.(${NTB},${DISCOVER})`]) {
      const q = oqishQarori('t2_akt', { filtr }, pto());
      expect(q.ok && q.qoshimchaFiltr).toEqual([`kompaniya_id=in.(${NTB})`]);
    }
  });

  it('boshqa kompaniyani aniq so‘rash — 403', () => {
    const q = oqishQarori('t2_f2_tafsilot', { filtr: `kompaniya_id=eq.${DISCOVER}` }, pto());
    expect(q).toMatchObject({ ok: false, status: 403, code: 'TENANT_FORBIDDEN' });
  });

  it('kompaniya ustuni yo‘q jadval: aniq obyekt majburiy, keyin uning egasi tekshiriladi', () => {
    expect(oqishQarori('t2_qator_holat', { filtr: '' }, pto())).toMatchObject({ ok: false, code: 'ANCHOR_MAJBURIY' });
    expect(oqishQarori('t2_qator_holat', { filtr: 'obyekt_id=in.(80,81)' }, pto())).toMatchObject({ ok: false, code: 'ANCHOR_MAJBURIY' });
    expect(oqishQarori('t2_qator_holat', { filtr: 'qator_id=eq.1' }, pto())).toMatchObject({ ok: false, code: 'ANCHOR_MAJBURIY' });
    const q = oqishQarori('t2_qator_holat', { filtr: 'obyekt_id=eq.80&qator_id=in.(1,2)' }, pto());
    expect(q).toEqual({ ok: true, qoshimchaFiltr: [], ota: { jadval: 't2_obyekt', id: 80 } });
    expect(oqishQarori('t2_viborka_qabul', { filtr: 'viborka_id=eq.7' }, pto())).toMatchObject({ ok: true, ota: { jadval: 't2_viborka', id: 7 } });
  });

  it('t2_kompaniya — faqat o‘zi a‘zo bo‘lganlar', () => {
    expect(oqishQarori('t2_kompaniya', { filtr: 'faol=is.true' }, pto())).toEqual({ ok: true, qoshimchaFiltr: [`id=in.(${NTB})`] });
  });

  it('platforma katalogi — o‘zi + platforma (kompaniya_id IS NULL), boshqa kompaniya emas', () => {
    expect(oqishQarori('t2_narx_manba_royxat', {}, pto())).toEqual({ ok: true, qoshimchaFiltr: [`or=(kompaniya_id.in.(${NTB}),kompaniya_id.is.null)`] });
  });

  it('eski TIZIM_01 ko‘zgusi — faqat superadmin', () => {
    expect(oqishQarori('holat', { filtr: 'obyekt=eq.X' }, pto())).toMatchObject({ ok: false, status: 403 });
    expect(oqishQarori('holat', { filtr: 'obyekt=eq.X' }, { ...pto(), rol: 'superadmin' })).toEqual({ ok: true, qoshimchaFiltr: [] });
  });

  it('noma’lum jadval, `or=`, embedding, alias, cast — rad', () => {
    expect(oqishQarori('t2_kopruk_navbat', {}, pto())).toMatchObject({ ok: false, code: 'JADVAL_YOPIQ' });
    expect(oqishQarori('t2_akt', { filtr: 'or=(kompaniya_id.eq.99)' }, pto())).toMatchObject({ ok: false, code: 'FILTR' });
    expect(oqishQarori('t2_akt', { ustunlar: '*,t2_kompaniya(*)' }, pto())).toMatchObject({ ok: false, code: 'USTUNLAR' });
    expect(oqishQarori('t2_akt', { ustunlar: 'x:kompaniya_id' }, pto())).toMatchObject({ ok: false, code: 'USTUNLAR' });
    expect(oqishQarori('t2_akt', { tartib: 'id.asc;drop' }, pto())).toMatchObject({ ok: false, code: 'TARTIB' });
  });

  it('a‘zoligi yo‘q yoki eski sessiya — rad', () => {
    expect(oqishQarori('t2_akt', {}, pto([]))).toMatchObject({ ok: false, status: 403 });
    expect(oqishQarori('t2_akt', {}, { rol: 'pto', exp: 1, jti: 'x' })).toMatchObject({ ok: false, code: 'SESSION_STALE' });
  });

  it('RPC kompaniyasi majburiy: berilmasa — yagona a‘zolik yoki rad; begona — 403', () => {
    expect(rpcKompaniyasi(pto(), null)).toEqual({ ok: true, id: NTB });
    expect(rpcKompaniyasi(pto([NTB, 21]), undefined)).toMatchObject({ ok: false, status: 400 });
    expect(rpcKompaniyasi(pto(), DISCOVER)).toMatchObject({ ok: false, status: 403 });
  });
});
