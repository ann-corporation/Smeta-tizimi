import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  idlar: vi.fn(),
  nomzod: vi.fn(),
  yoz: vi.fn(),
}));
vi.mock('./t2-f2-storno', () => ({ f2StornoAktIdlari: m.idlar }));
vi.mock('./vaqtli-fetch', () => ({ vaqtliOqish: m.nomzod }));
vi.mock('./supabase', () => ({ yozAmali: m.yoz }));

import { aktPodvalStornoQoralamalarga } from './t2-akt-podval';

const nomzodJavob = (aktlar: Array<{ akt_id: number; holat: string }>) => ({ json: async () => ({ ok: true, natija: { ok: true, aktlar } }) });

describe('aktPodvalStornoQoralamalarga', () => {
  beforeEach(() => { m.idlar.mockReset(); m.nomzod.mockReset(); m.yoz.mockReset(); });

  it('faqat tasdiqlanmagan (qoralama) storno aktlariga manba=storno bilan yozadi; blok = manba akt id', async () => {
    m.idlar.mockResolvedValue([600, 601, 602]);
    m.nomzod.mockResolvedValue(nomzodJavob([
      { akt_id: 535, holat: 'tasdiqlangan' }, { akt_id: 600, holat: 'qoralama' }, { akt_id: 601, holat: 'tasdiqlangan' }, { akt_id: 602, holat: 'bekor' },
    ]));
    m.yoz.mockResolvedValue({ ok: true });
    const n = await aktPodvalStornoQoralamalarga({ kompaniyaId: 7, obyektId: 3, manbaAktId: 535 });
    expect(n).toEqual({ topildi: 1, yangilandi: 1, podvalYoq: 0, xato: 0 });
    expect(m.yoz).toHaveBeenCalledTimes(1);
    expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ amal: 'akt_podval_yoz_v1', akt_id: 600, blok: '535', manba: 'storno', manba_akt_id: 535 }));
  });

  it('storno qoralama yo‘q — hech narsa yozilmaydi; yozuv yiqilsa xato sanaladi', async () => {
    m.idlar.mockResolvedValue([]);
    m.nomzod.mockResolvedValue(nomzodJavob([{ akt_id: 535, holat: 'tasdiqlangan' }]));
    expect(await aktPodvalStornoQoralamalarga({ kompaniyaId: 7, obyektId: 3, manbaAktId: 535 })).toEqual({ topildi: 0, yangilandi: 0, podvalYoq: 0, xato: 0 });
    expect(m.yoz).not.toHaveBeenCalled();

    m.idlar.mockResolvedValue([600, 603]);
    m.nomzod.mockResolvedValue(nomzodJavob([{ akt_id: 600, holat: 'qoralama' }, { akt_id: 603, holat: 'qoralama' }]));
    m.yoz.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'X' });
    expect(await aktPodvalStornoQoralamalarga({ kompaniyaId: 7, obyektId: 3, manbaAktId: 535 })).toEqual({ topildi: 2, yangilandi: 1, podvalYoq: 0, xato: 1 });
  });
});
