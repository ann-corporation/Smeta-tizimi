import { beforeEach, describe, expect, it, vi } from 'vitest';

const yozMock = vi.fn();
const taklifMock = vi.fn();
const friksiyaMock = vi.fn();
const platformaMock = vi.fn();
vi.mock('../../api/t2-osuvchi', () => ({
  osuvchiYoz: (p: unknown) => yozMock(p),
  osuvchiTaklifOl: (...a: unknown[]) => taklifMock(...a),
  osuvchiFriksiyaOl: (...a: unknown[]) => friksiyaMock(...a),
  osuvchiPlatformaFriksiyaOl: (...a: unknown[]) => platformaMock(...a),
  osuvchiMeningOl: vi.fn(),
}));

import { frictionKey, friksiyaBoshla, friksiyaHolat, friksiyaKontekst, friksiyaTozala, friksiyaYoz, friksiyaYubor, qidiruvSozi, vaqtChelagi } from './friksiya';
import { tajribaKalit, tajribaKeshniTozala, tajribaNatija, tajribaSabab, tajribaTaklif, tajribaYoz } from './tajriba';
import { kursTavsiya, kursTavsiyaUlash, qiyinJoyDarslari, qiyinJoylar } from './kurs';
import { niyatAniqla, type NiyatKontekst } from '../yordamchi/niyat';

beforeEach(() => {
  yozMock.mockReset(); taklifMock.mockReset(); friksiyaMock.mockReset(); platformaMock.mockReset();
  friksiyaTozala(); tajribaKeshniTozala(); kursTavsiyaUlash(null);
  try { localStorage.clear(); } catch { /* jsdom */ }
});

describe('tajriba: kalit va natija', () => {
  it('kalit lotin/kirill, tinish belgisiz, kichik harf, ≤160', () => {
    expect(tajribaKalit("  G'isht   KLADKA!! ")).toBe('gisht kladka');
    expect(tajribaKalit('Шпаклёвка, стен')).toBe('шпаклёвка стен');
    expect(tajribaKalit('x'.repeat(500)).length).toBe(160);
  });
  it('taklif bo‘lmasa — tasdiq; mos kelsa tasdiq; boshqasi tanlansa tuzatish (+rad etilgan taklif)', () => {
    expect(tajribaNatija(null, 'a')).toEqual({ natija: 'tasdiq' });
    expect(tajribaNatija({ qiymat: 'a' }, 'a')).toEqual({ natija: 'tasdiq' });
    expect(tajribaNatija({ qiymat: 'a' }, 'b')).toEqual({ natija: 'tuzatish', taklifQiymat: 'a' });
  });
  it('sabab matni darajaga qarab', () => {
    expect(tajribaSabab({ daraja: 'user', tasdiq: 3 })).toContain('3');
    expect(tajribaSabab({ daraja: 'kompaniya', tasdiq: 12, foydalanuvchi_soni: 4 })).toContain('12');
    expect(tajribaSabab({ daraja: 'tizim' }).length).toBeGreaterThan(5);
  });
});

describe('tajribaTaklif / tajribaYoz', () => {
  it('taklif sabab bilan qaytadi va 60 s keshlanadi; yozgandan keyin kesh tozalanadi', async () => {
    taklifMock.mockResolvedValue({ daraja: 'user', qiymat: 'ЧЕЛ|metr|0.5', tasdiq: 3 });
    const a = await tajribaTaklif('naryad_qator', 'Kod 1', { kompaniyaId: 7 });
    expect(a).toMatchObject({ daraja: 'user', qiymat: 'ЧЕЛ|metr|0.5', tasdiq: 3 });
    expect(a?.sabab).toBeTruthy();
    await tajribaTaklif('naryad_qator', 'kod 1', { kompaniyaId: 7 });
    expect(taklifMock).toHaveBeenCalledTimes(1);
    expect(taklifMock).toHaveBeenCalledWith(7, 'naryad_qator', 'kod 1');
    yozMock.mockResolvedValue({ ok: true });
    await tajribaYoz({ domen: 'naryad_qator', kalit: 'Kod 1', qiymat: 'ЧЕЛ|metr|0.5' }, { kompaniyaId: 7 });
    await tajribaTaklif('naryad_qator', 'kod 1', { kompaniyaId: 7 });
    expect(taklifMock).toHaveBeenCalledTimes(2);
  });
  it('daraja null yoki kompaniya yo‘q bo‘lsa — null, tarmoq xatosi o‘rganishni to‘xtatmaydi', async () => {
    taklifMock.mockResolvedValue({ daraja: null });
    expect(await tajribaTaklif('lugat', 'x', { kompaniyaId: 1 })).toBeNull();
    expect(await tajribaTaklif('lugat', 'x', { kompaniyaId: null })).toBeNull();
    yozMock.mockRejectedValue(new Error('net'));
    await expect(tajribaYoz({ domen: 'lugat', kalit: 'x', qiymat: 'y' }, { kompaniyaId: 1 })).resolves.toBe(false);
  });
  it('yozish yuki: normallashgan kalit, natija, rad etilgan taklif; bo‘sh qiymat yuborilmaydi', async () => {
    yozMock.mockResolvedValue({ ok: true });
    await tajribaYoz({ domen: 'lugat', kalit: "Kirpich!", qiymat: " g'isht ", natija: 'tuzatish', taklifQiymat: 'blok' }, { kompaniyaId: 3 });
    expect(yozMock).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 3, amal: 'tajriba_yoz', yuk: { domen: 'lugat', kalit: 'kirpich', qiymat: "g'isht", natija: 'tuzatish', taklif_qiymat: 'blok' } }));
    yozMock.mockClear();
    expect(await tajribaYoz({ domen: 'lugat', kalit: 'x', qiymat: '  ' }, { kompaniyaId: 3 })).toBe(false);
    expect(yozMock).not.toHaveBeenCalled();
  });
});

describe('ishqalanish sensori', () => {
  it('hodisalar xotirada SANALADI (qator emas) va bitta partiya bilan yuboriladi', async () => {
    yozMock.mockResolvedValue({ ok: true });
    friksiyaKontekst(5);
    friksiyaYoz('naryad', 'yaratish', 'boshlandi'); friksiyaYoz('naryad', 'yaratish', 'boshlandi');
    friksiyaYoz('naryad', 'yaratish', 'tashlandi');
    expect(friksiyaHolat().navbat).toBe(2);
    await friksiyaYubor();
    expect(yozMock).toHaveBeenCalledTimes(1);
    const p = yozMock.mock.calls[0][0] as { amal: string; yuk: { qatorlar: Array<{ h: string; n: number; o: number }> } };
    expect(p.amal).toBe('friksiya_yubor');
    expect(p.yuk.qatorlar.find((q) => q.h === 'boshlandi')?.n).toBe(2);
    expect(friksiyaHolat()).toEqual({ navbat: 0, inflight: false });
  });
  it('yuborish muvaffaqiyatsiz bo‘lsa AYNAN shu partiya bir xil id bilan qayta yuboriladi (idempotent)', async () => {
    friksiyaKontekst(5);
    friksiyaYoz('f2', 'import', 'xato', 'VAROQ_YOQ');
    yozMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    await friksiyaYubor();
    expect(friksiyaHolat().inflight).toBe(true);
    friksiyaYoz('f2', 'import', 'tashlandi'); // yangi hodisa eski partiyaga aralashmaydi
    await friksiyaYubor();
    const [a, b] = yozMock.mock.calls.map((c) => c[0] as { operationId: string; yuk: { qatorlar: unknown[] } });
    expect(b.operationId).toBe(a.operationId);
    expect(b.yuk.qatorlar).toEqual(a.yuk.qatorlar);
    expect(friksiyaHolat().navbat).toBe(1);
  });
  it('«odam» faqat shu kuni shu kalitning birinchi yuborilishida 1', async () => {
    yozMock.mockResolvedValue({ ok: true });
    friksiyaKontekst(5);
    friksiyaYoz('a', 'b', 'tashlandi'); await friksiyaYubor();
    friksiyaYoz('a', 'b', 'tashlandi'); await friksiyaYubor();
    const o = yozMock.mock.calls.map((c) => (c[0] as { yuk: { qatorlar: Array<{ o: number }> } }).yuk.qatorlar[0].o);
    expect(o).toEqual([1, 0]);
  });
  it('nol_qidiruv so‘zi maxfiy ma’lumotsiz normallashadi; 5+ raqam, e-pochta, juda qisqa so‘z tashlanadi', () => {
    expect(qidiruvSozi('  Gipsokarton <b> ')).toBe('gipsokarton <b>'.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim());
    expect(qidiruvSozi('INN 123456789')).toBeNull();
    expect(qidiruvSozi('x')).toBeNull();
    friksiyaKontekst(5);
    friksiyaYoz('q', 'lugat', 'nol_qidiruv', 'hisob 12345678901234567890');
    expect(friksiyaHolat().navbat).toBe(0);
  });
  it('kardinallik: xotirada ≤200 kalit', () => {
    for (let i = 0; i < 260; i += 1) friksiyaYoz(`s${i}`, 'a', 'boshlandi');
    expect(friksiyaHolat().navbat).toBe(200);
  });
  it('oqim kuzatuvi: aynan BIR yakun; vaqt chelagi', () => {
    friksiyaKontekst(5);
    let t = 1000; const soat = () => t;
    const k = friksiyaBoshla('x', 'y', soat);
    t += 40_000; k.tugadi(); k.tashlandi(); k.tugadi();
    expect(k.tugagan()).toBe(true);
    expect(friksiyaHolat().navbat).toBe(2); // boshlandi + tugadi(t2); tashlandi qo'shilmaydi
    expect([vaqtChelagi(1000), vaqtChelagi(10_000), vaqtChelagi(60_000), vaqtChelagi(300_000), vaqtChelagi(900_000)]).toEqual(['t0', 't1', 't2', 't3', 't4']);
  });
  it('barqaror friction kaliti', () => { expect(frictionKey('f2-import', 'yuklash')).toBe('f2-import:yuklash'); });
});

describe('kurs seam (qattiq bog‘liqlik yo‘q) va qiyin joylar', () => {
  const joy = (sahifa: string, amal: string) => ({ sahifa, amal, boshlandi: 10, tugadi: 2, tashlandi: 6, xato: 1, nol_qidiruv: 0, odam: 4, nuqson: 0.7, ball: 2.8, top_kod: null, top_hodisa: null, dori: 'dars' as const });
  it('ulanmagan bo‘lsa bo‘sh; ulansa frictionKey lar bo‘yicha tavsiya', async () => {
    expect(kursTavsiya(['a:b'])).toEqual([]);
    friksiyaMock.mockResolvedValue([joy('f2-import', 'yuklash'), joy('*', '*')]);
    const j = await qiyinJoylar(9, 5);
    expect(j.map((x) => x.kalit)).toEqual(['f2-import:yuklash']);
    kursTavsiyaUlash((keys) => keys.map((k) => ({ dars: `dars-${k}` })));
    const r = await qiyinJoyDarslari(9);
    expect(r.darslar).toEqual([{ dars: 'dars-f2-import:yuklash' }]);
  });
  it('kompaniya berilmasa — platforma (anonim) manbasi', async () => {
    platformaMock.mockResolvedValue([joy('naryad', 'yaratish')]);
    expect((await qiyinJoylar(null))[0].kalit).toBe('naryad:yaratish');
    expect(friksiyaMock).not.toHaveBeenCalled();
  });
  it('kurs provayderi xato otsa — bo‘sh', () => {
    kursTavsiyaUlash(() => { throw new Error('x'); });
    expect(kursTavsiya(['a:b'])).toEqual([]);
  });
});

describe('Jarvis niyati (ru/en/uz)', () => {
  const ctx: NiyatKontekst = { sahifalar: [{ yol: '/admin/osuvchi', nom: 'Tizim o‘rganishi', guruh: 'Shaxsiy' }], obyektlar: [], bugun: new Date(2026, 10, 13) };
  it.each([
    ['tizim nimani o‘rgandi', 'oqigan'], ['чему научилась система', 'oqigan'], ['what did the system learn', 'oqigan'],
    ['qayerda qiynalishyapti', 'qiyin'], ['где затрудняются пользователи', 'qiyin'], ['where do users struggle', 'qiyin'],
  ])('«%s» -> %s', (matn, qism) => {
    const n = niyatAniqla(matn, ctx);
    expect(n).toEqual({ tur: 'osuvchi', qism });
  });
});
