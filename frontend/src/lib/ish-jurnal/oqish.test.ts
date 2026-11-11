import { beforeEach, describe, expect, it, vi } from 'vitest';

const sbOqi = vi.fn();
const yozAmali = vi.fn();
const murojaatlarOl = vi.fn();
vi.mock('../../api/supabase', () => ({ sbOqi: (s: unknown) => sbOqi(s), yozAmali: (y: unknown) => yozAmali(y), yangiOperationId: () => '00000000-0000-4000-8000-000000000000' }));
vi.mock('../../api/t2-tomon', () => ({ murojaatlarOl: (...a: unknown[]) => murojaatlarOl(...a) }));

import { izohSaqla, jurnalIzohYoz, kunOl } from './oqish';

const ok = (qatorlar: unknown[]) => ({ ok: true, qatorlar });

beforeEach(() => {
  sbOqi.mockReset(); yozAmali.mockReset(); murojaatlarOl.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: false }) })));
});

function tayyorla(o: { izoh?: unknown[]; kirimOk?: boolean } = {}) {
  sbOqi.mockImplementation(async (s: { jadval: string }) => {
    switch (s.jadval) {
      case 't2_akt': return ok([{ id: 1, holat: 'qoralama' }]);
      case 't2_akt_qator': return ok([{ akt_id: 1, qator_id: 10, hajm: '4' }]);
      case 't2_qator': return ok([{ id: 10, kod: 'К1', nom: 'Бетон', birlik: 'м3', tartib: 1 }]);
      case 't2_sklad_harakat': return o.kirimOk === false ? { ok: false } : ok([{ id: 7, nomi: 'Цемент', birligi: 'т', obyomi: 2, operatsiya: 'prixod', holat: 'faol' }]);
      case 't2_aosr_reestr_v2': return ok([{ id: 3, raqam: '9', ish_nomi: 'Армирование', holat: 'tasdiqlangan', sana: '2026-11-12' }]);
      case 't2_ish_jurnal_izoh': return ok(o.izoh ?? []);
      case 't2_obyekt': return ok([{ lat: null, lng: null }]);
      default: return ok([]);
    }
  });
  murojaatlarOl.mockResolvedValue({ ok: true, natija: [{ id: 5, turi: 'predpisaniya', sarlavha: 'Трещины', holat: 'ochiq', muddat: null, yaratildi: '2026-11-12T07:00:00Z', obyekt_nom: 'Объект' }] });
}

describe('kunOl — hosil qilingan jurnal', () => {
  it('fakt, kirim, АОСР va murojaat bitta kunga yig‘iladi; izoh yo‘q — null', async () => {
    tayyorla();
    const k = await kunOl({ kompaniyaId: 1, obyektId: 2, obyektNomi: 'Объект', sana: '2026-11-12' });
    expect(k.ishlar).toEqual([{ qatorId: 10, kod: 'К1', nom: 'Бетон', birlik: 'м3', hajm: 4, aktlar: 1 }]);
    expect(k.kirimlar.map((x) => x.nomi)).toEqual(['Цемент']);
    expect(k.aosr.map((x) => x.raqam)).toEqual(['9']);
    expect(k.murojaatlar.map((x) => x.id)).toEqual([5]);
    expect(k.izoh).toBeNull(); expect(k.olinmagan).toEqual([]); expect(k.obHavo).toBeNull();
    // fakt akti so‘rovi: faqat shu obyekt, shu kun, fakt turi, bekor emas
    const aktSoro = sbOqi.mock.calls.map((c) => c[0]).find((s) => s.jadval === 't2_akt');
    expect(aktSoro.filtr).toBe('obyekt_id=eq.2&tur=eq.fakt&sana=eq.2026-11-12&holat=neq.bekor');
  });
  it('manba o‘qilmasa jim yo‘qotilmaydi — olinmagan ro‘yxatida', async () => {
    tayyorla({ kirimOk: false });
    const k = await kunOl({ kompaniyaId: 1, obyektId: 2, obyektNomi: 'Объект', sana: '2026-11-12' });
    expect(k.olinmagan).toEqual(['kirim']);
  });
  it('tasdiqlangan izoh va ob-havo snapshot jonli so‘rovsiz olinadi', async () => {
    tayyorla({ izoh: [{ izoh: 'Дождь', odamlar: '2 бригады', ob_havo: { harorat_min: 1, harorat_max: 5, yogin_mm: 3, shamol_max: null, kod: 61, manba: 'open-meteo' }, tasdiqlandi: true, versiya: 2 }] });
    const k = await kunOl({ kompaniyaId: 1, obyektId: 2, obyektNomi: 'Объект', sana: '2026-11-12' });
    expect(k.izoh).toMatchObject({ izoh: 'Дождь', tasdiqlandi: true, versiya: 2 });
    expect(k.obHavo?.kod).toBe(61);
  });
});

describe('izoh saqlash', () => {
  it('gateway natijasi (tekis) — versiya va CAS kodi qaytadi', async () => {
    yozAmali.mockResolvedValueOnce({ ok: true, versiya: 3, tasdiqlandi: true });
    const r = await izohSaqla({ kompaniyaId: 1, obyektId: 2, sana: '2026-11-12', izoh: ' matn ', odamlar: '', obHavo: null, tasdiqlash: true, kutilganVersiya: 2 });
    expect(r).toEqual({ ok: true, versiya: 3, tasdiqlandi: true });
    expect(yozAmali.mock.calls[0][0]).toMatchObject({ amal: 'ish_jurnal_saqla_v1', izoh: 'matn', odamlar: null, tasdiqlash: true, kutilgan_versiya: 2 });
    yozAmali.mockResolvedValueOnce({ ok: true, natija: undefined, code: 'STALE_VERSION' });
    yozAmali.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION', versiya: 5 });
    const s = await izohSaqla({ kompaniyaId: 1, obyektId: 2, sana: '2026-11-12', izoh: 'x', odamlar: '', obHavo: null, tasdiqlash: false, kutilganVersiya: null });
    expect(s.ok).toBe(true); // ok:true javob — muvaffaqiyat
    const e = await izohSaqla({ kompaniyaId: 1, obyektId: 2, sana: '2026-11-12', izoh: 'x', odamlar: '', obHavo: null, tasdiqlash: false, kutilganVersiya: null });
    expect(e).toMatchObject({ ok: false, code: 'STALE_VERSION' });
  });
  it('AI izohi mavjudini o‘chirmaydi (qo‘shadi), takror matnni qayta yozmaydi, qoralama sifatida', async () => {
    tayyorla({ izoh: [{ izoh: 'Бетонирование', odamlar: '3', ob_havo: null, tasdiqlandi: true, versiya: 4 }] });
    yozAmali.mockResolvedValue({ ok: true, versiya: 5, tasdiqlandi: false });
    const r = await jurnalIzohYoz({ kompaniyaId: 1, obyektId: 2, obyektNomi: 'Объект', sana: '2026-11-12', matn: 'Дождь с 14:00', operationId: 'op' });
    expect(r.ok).toBe(true);
    expect(yozAmali.mock.calls[0][0]).toMatchObject({ izoh: 'Бетонирование\nДождь с 14:00', odamlar: '3', tasdiqlash: false, kutilgan_versiya: 4, operation_id: 'op' });
    yozAmali.mockClear();
    const t = await jurnalIzohYoz({ kompaniyaId: 1, obyektId: 2, obyektNomi: 'Объект', sana: '2026-11-12', matn: 'Бетонирование', operationId: 'op2' });
    expect(t.ok).toBe(true); expect(yozAmali).not.toHaveBeenCalled();
  });
});
