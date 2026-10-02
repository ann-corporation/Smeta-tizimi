import { describe, expect, it } from 'vitest';
import { egaQarori, yozishTalablari } from './tenant-yozish';

/* NTB = 17 (foydalanuvchi a'zo), Discover Invest = 99 (begona). */
const NTB = 17;
const DISCOVER = 99;
const ega = (rows: Record<string, Record<number, number | null>>) =>
  new Map(Object.entries(rows).map(([j, m]) => [j, new Map(Object.entries(m).map(([id, k]) => [Number(id), k]))]));

describe('Yozish izolyatsiyasi (NTB ↔ Discover Invest)', () => {
  it('o‘z kompaniyasi ID si + BEGONA to‘lov ID si — rad (avvalgi teshik)', () => {
    const t = yozishTalablari('tolov_ochir', { p_tolov_id: 501, p_kutilgan_versiya: 1 });
    expect(t).toEqual({ ok: true, kompaniyalar: [], sorovlar: [{ jadval: 't2_tolov', idlar: [501] }] });
    if (!t.ok) return;
    expect(egaQarori([NTB], t, ega({ t2_tolov: { 501: DISCOVER } }))).toMatchObject({ ok: false, status: 403 });
    expect(egaQarori([NTB], t, ega({ t2_tolov: { 501: NTB } }))).toEqual({ ok: true });
  });

  it('topilmagan yozuv — rad (mavjudligini ham oshkor qilmaydi)', () => {
    const t = yozishTalablari('qator_tahrir', { p_qator_id: 7 });
    if (!t.ok) throw new Error();
    expect(egaQarori([NTB], t, ega({ t2_qator: {} }))).toMatchObject({ ok: false, status: 403 });
  });

  it('kompaniya, obyekt, qatorlar (p_qatorlar), massivlar — hammasi yig‘iladi', () => {
    const t = yozishTalablari('fakt_yoz_v2', { p_obyekt_id: 80, p_qatorlar: [{ qator_id: 1, hajm: 2 }, { qator_id: 2 }], p_kompaniya_id: NTB });
    expect(t).toMatchObject({ ok: true, kompaniyalar: [NTB] });
    if (!t.ok) return;
    expect(t.sorovlar).toEqual(expect.arrayContaining([{ jadval: 't2_obyekt', idlar: [80] }, { jadval: 't2_qator', idlar: [1, 2] }]));
    expect(egaQarori([NTB], t, ega({ t2_obyekt: { 80: NTB }, t2_qator: { 1: NTB, 2: DISCOVER } }))).toMatchObject({ ok: false });
    const a = yozishTalablari('aosr_bog_saqla', { p_aosr_ids: [3, 4], p_qator_ids: [9] });
    expect(a.ok && a.sorovlar).toEqual([{ jadval: 't2_aosr', idlar: [3, 4] }, { jadval: 't2_qator', idlar: [9] }]);
  });

  it('p_id ma’nosi amalga bog‘liq; noma’lum amalda p_id — rad', () => {
    expect(yozishTalablari('loyiha_ochir', { p_id: 5 })).toMatchObject({ ok: true, sorovlar: [{ jadval: 't2_loyiha', idlar: [5] }] });
    expect(yozishTalablari('kompaniya_yangila', { p_id: DISCOVER })).toMatchObject({ ok: true, kompaniyalar: [DISCOVER] });
    expect(yozishTalablari('yangi_noma_lum_amal', { p_id: 5 })).toMatchObject({ ok: false, status: 403 });
    expect(yozishTalablari('aosr_yoz', { p_id: null, p_obyekt_id: 80 })).toMatchObject({ ok: true, sorovlar: [{ jadval: 't2_obyekt', idlar: [80] }] });
  });

  it('platforma katalogi (kompaniya_id IS NULL) ni kompaniya foydalanuvchisi o‘zgartira olmaydi', () => {
    const t = yozishTalablari('narx_manba_bekor', { p_kompaniya_id: NTB, p_id: 2 });
    if (!t.ok) throw new Error();
    expect(egaQarori([NTB], t, ega({ t2_narx_manba: { 2: null } }))).toMatchObject({ ok: false });
  });

  it('korzinka — faqat oq ro‘yxatdagi jadval; p_request ichi ham tekshiriladi; superadmin maqsad kompaniyasi', () => {
    expect(yozishTalablari('butunlay_ochirish', { p_jadval: 't2_akt', p_id: 1 })).toMatchObject({ ok: false });
    expect(yozishTalablari('korzinkaga_tashlash', { p_jadval: 't2_obyekt', p_id: 80 })).toMatchObject({ ok: true, sorovlar: [{ jadval: 't2_obyekt', idlar: [80] }] });
    const r = yozishTalablari('ish_resurslar_bilan_yarat_v1', { p_request: { kompaniya_id: NTB, obyekt_id: 80, ota_qator_id: 11 } });
    expect(r).toMatchObject({ ok: true, kompaniyalar: [NTB] });
    expect(r.ok && r.sorovlar).toEqual(expect.arrayContaining([{ jadval: 't2_obyekt', idlar: [80] }, { jadval: 't2_qator', idlar: [11] }]));
    expect(yozishTalablari('token_toldir_v1', { p_kompaniya_id: DISCOVER, p_actor_id: 1 })).toEqual({ ok: true, kompaniyalar: [], sorovlar: [] });
    expect(egaQarori([NTB], { kompaniyalar: [DISCOVER], sorovlar: [] }, new Map())).toMatchObject({ ok: false });
  });

  it('resurs bog‘lash — tur bo‘yicha jadval, noma’lum tur rad', () => {
    expect(yozishTalablari('resurs_bog_saqla', { p_tur: 'kadr', p_resurs_id: 3, p_obyekt_id: 80 })).toMatchObject({ ok: true });
    expect(yozishTalablari('resurs_bog_saqla', { p_tur: 'x', p_resurs_id: 3 })).toMatchObject({ ok: false });
  });
});
