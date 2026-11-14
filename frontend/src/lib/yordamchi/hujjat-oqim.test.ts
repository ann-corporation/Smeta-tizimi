import { describe, expect, it, vi } from 'vitest';
import { aosrQoralamaReja, aosrYetishmaydiMatni, aosrYetishmaydi, f2QoralamaReja, f2RoyxatMatni, qarzMatni, type HujjatDeps } from './hujjat-oqim';

const cov = (qator_id: number, nom: string) => ({ qator_id, obyekt_id: 5, nom, kod: 'К' + qator_id, birlik: 'м3', kat: 'bl', fakt_hajm: 3, yashirin: true, akt_bor: false });
const meta = [{ id: 1, ota_id: null, tartib: 1, tur: 'rz', nom: 'Fundament' }, { id: 2, ota_id: 1, tartib: 1, tur: 'bl', nom: 'Beton' }];

function deps(o: Partial<HujjatDeps> = {}): HujjatDeps {
  return {
    kompaniyaId: 17,
    aktReestr: vi.fn(async () => ({ ok: true, qatorlar: [] })) as never,
    daraxtHolat: vi.fn(async () => ({ ok: false as const })),
    protokol: vi.fn(async () => ({ ok: true, qatorlar: [] })) as never,
    qoralamaHajm: vi.fn(async () => ({ ok: true, hajm: new Map(), aktSoni: 0 })),
    bajarilmadi: vi.fn(async () => ({ ok: true, qatorlar: [] })),
    zamena: vi.fn() as never,
    aktYarat: vi.fn(async () => ({ ok: true })) as never,
    token: vi.fn() as never,
    qarz: vi.fn(async () => ({ ok: true as const, qatorlar: [] })),
    aosrCoverage: vi.fn(async () => ({ ok: true, qatorlar: [cov(2, 'Бетон монолитный')] })) as never,
    qatorMeta: vi.fn(async () => meta),
    aosrReestr: vi.fn(async () => ({ ok: true, qatorlar: [] })) as never,
    faktSanalar: vi.fn(async () => ({ links: [], aktlar: [] })),
    imzochilar: vi.fn(async () => null) as never,
    aosrYoz: vi.fn(async () => ({ ok: true, id: 99 })),
    aosrBog: vi.fn(async () => ({ ok: true })),
    opId: () => 'op-1',
    ...o,
  };
}

describe('o‘qishlar', () => {
  it('qarz: jami F3 − to‘lov, noma’lum 0 emas', async () => {
    const d = deps({ qarz: vi.fn(async () => ({ ok: true as const, qatorlar: [
      { shartnoma_id: 1, raqam: '5', nom: 'x', yonalish: 'debitor' as const, kontragent: 'Zakazchik', shartnoma_summa: 100, f3_sotuv: 100, tolangan: 40, f2_nakrutkasiz: 90, qarz: 60, oxirgi_tolov_sana: null, obyektlar: [] },
      { shartnoma_id: 2, raqam: '6', nom: 'y', yonalish: 'debitor' as const, kontragent: null, shartnoma_summa: null, f3_sotuv: null, tolangan: null, f2_nakrutkasiz: null, qarz: null, oxirgi_tolov_sana: null, obyektlar: [] },
    ] })) });
    const m = await qarzMatni(d);
    expect(m).toContain('60');
    expect(m).toContain('noma’lum');
  });
  it('F2 ro‘yxati oy bo‘yicha', async () => {
    const d = deps({ aktReestr: vi.fn(async () => ({ ok: true, qatorlar: [
      { id: 1, raqam: '3', oy: '2026-10-01', holat: 'qoralama', qator_soni: 4, hujjat_jami: 1000, yozilgan_jami: 1000, narxsiz_qator: 0 },
      { id: 2, raqam: '2', oy: '2026-09-01', holat: 'tasdiqlangan', qator_soni: 2, hujjat_jami: 500, yozilgan_jami: 500, narxsiz_qator: 0 },
    ] })) as never });
    const m = await f2RoyxatMatni(d, 5, '2026-10');
    expect(m).toContain('№3'); expect(m).not.toContain('№2');
  });
  it('АОСР nima yetishmayapti', async () => {
    const h = await aosrYetishmaydi(deps(), 5);
    expect(aosrYetishmaydiMatni(h)).toContain('1 ta yashirin ishga');
  });
});

describe('АОСР qoralama (faqat «yangi», tasdiqsiz)', () => {
  it('reja yozmaydi; bajar() holat «yangi» qoralama yozadi va qatorlarni bog‘laydi', async () => {
    const d = deps();
    const reja = await aosrQoralamaReja(d, 5, 'beton');
    if ('xato' in reja) throw new Error(reja.xato);
    expect(d.aosrYoz).not.toHaveBeenCalled();
    const out = await reja.bajar(new Set(reja.guruhlar.map((g) => g.razdelId)));
    expect(d.aosrYoz).toHaveBeenCalledTimes(1);
    const p = (d.aosrYoz as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as { malumot: { holat: string }; operationId: string };
    expect(p.malumot.holat).toBe('yangi'); expect(p.operationId).toBe('op-1');
    expect(d.aosrBog).toHaveBeenCalledWith([99], expect.arrayContaining([2]));
    expect(out[0]).toContain('tasdiqlang');
  });
  it('tanlanmasa hech narsa yozilmaydi', async () => {
    const d = deps();
    const reja = await aosrQoralamaReja(d, 5, null);
    if ('xato' in reja) throw new Error(reja.xato);
    expect(await reja.bajar(new Set())).toEqual([]);
    expect(d.aosrYoz).not.toHaveBeenCalled();
  });
});

describe('F2 qoralama xavfsizligi', () => {
  it('oy uchun F2 allaqachon bor — yangisi yaratilmaydi', async () => {
    const d = deps({ aktReestr: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 7, raqam: '4', oy: '2026-10-01', holat: 'qoralama' }] })) as never });
    const r = await f2QoralamaReja(d, 5, '2026-10');
    expect(r.ok).toBe(false);
    expect(d.aktYarat).not.toHaveBeenCalled();
  });
  it('manba o‘qilmasa (protokol/qoralama hajm) — to‘xtaydi, yozmaydi', async () => {
    const rows = [{ id: 1, tur: 'rz' }] as never;
    const d = deps({ daraxtHolat: vi.fn(async () => ({ ok: true as const, rows, holat: [] })), qoralamaHajm: vi.fn(async () => ({ ok: false, hajm: new Map(), aktSoni: 0 })) });
    const r = await f2QoralamaReja(d, 5, '2026-10');
    expect(r.ok).toBe(false);
    expect(d.aktYarat).not.toHaveBeenCalled();
    expect(d.token).not.toHaveBeenCalled();
  });
});
