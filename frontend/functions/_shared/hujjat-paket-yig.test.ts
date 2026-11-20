// @ts-nocheck -- /api/hujjat-paket yig'ish orkestratori: sayt (paketZipi) bilan bir xil ZIP yo'llari va «Tarkib»; token baho faqat hisoblaydi (tarmoq soxta).
import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { PAKET_BAYT_CHEGARA, paketBaho, paketKalitAktorniki, paketR2Kalit, paketRejaServer, paketYigServer } from './hujjat-paket-yig';
import { TARKIB_FAYL_NOMI } from '../../src/lib/f2-oylik-paket/eksport';
import { paketYigish, paketZipi } from '../../src/lib/hujjat-paket/yigish';
import { paketReja } from '../../src/lib/hujjat-paket/nomzod';

const N = (o = {}) => ({
  kalit: 'f2:1', tur: 'f2', sarlavha: 'F-2 № 1', holat: 'tasdiqlangan', loyiha_id: 1, loyiha_nom: 'L', shartnoma_id: 3, shartnoma_raqam: '7', obyekt_id: 5, obyekt_nom: 'Obyekt',
  oy: '2031-03', akt_id: 1, forma3_id: null, taxminiy: false, takror: false, qator_soni: 10, fayl_id: 11, versiya: 2, bayt: 1000, yasash: false, tolangan: false, ...o,
});
const yet = () => ({
  diskdan: vi.fn(async (n) => ({ bytes: new Uint8Array([1, 2, 3]), faylNomi: `${n.kalit.replace(':', '_')}.xlsx` })),
  yasa: vi.fn(async (n) => ({ bytes: new Uint8Array([9, 9]), faylNomi: `${n.kalit.replace(':', '_')}_yangi.xlsx` })),
});

describe('/api/hujjat-paket orkestratori', () => {
  it('reja: takror/taxminiy tashlanadi; F-2 doim yasash (server dvigateli), boshqa tur Diskdan', () => {
    const r = paketRejaServer([N(), N({ kalit: 'f2:2', akt_id: 2, takror: true }), N({ kalit: 'f2:3', akt_id: 3, taxminiy: true }), N({ kalit: 'm29:1', tur: 'm29', oy: '2031-03', akt_id: null, fayl_id: 12 })]);
    expect(r.yasash.map((x) => x.kalit)).toEqual(['f2:1']);
    expect(r.diskdan.map((x) => x.kalit)).toEqual(['m29:1']);
  });
  it('ZIP yo\'llari va Tarkib sayt paketZipi bilan aynan bir xil', async () => {
    const nomz = [N(), N({ kalit: 'm29:1', tur: 'm29', oy: '2031-03', akt_id: null, fayl_id: 12, sarlavha: 'M-29' })];
    const y = yet();
    const server = await paketYigServer(nomz, 'HUJJATLAR PAKETI', 'zip', y);
    // sayt: HujjatPaket.yuklabOl bilan bir xil qadamlar
    const toza = nomz.filter((n) => !n.takror && !n.taxminiy); const r0 = paketReja(toza, new Set(toza.map((n) => n.kalit)));
    const reja = { diskdan: r0.diskdan.filter((n) => n.tur !== 'f2'), yasash: [...r0.yasash, ...r0.diskdan.filter((n) => n.tur === 'f2')] };
    const sayt = paketZipi(await paketYigish(reja, yet(), {}), { sarlavha: 'HUJJATLAR PAKETI', reja: { rad: [], olinmaydi: [] } });
    const a = unzipSync(server.bytes); const b = unzipSync(sayt.bytes);
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(Object.keys(a)).toContain(TARKIB_FAYL_NOMI);
    expect(strFromU8(a[TARKIB_FAYL_NOMI])).toBe(strFromU8(b[TARKIB_FAYL_NOMI]));
    expect(server).toMatchObject({ nom: 'hujjatlar-paketi.zip', mime: 'application/zip', soni: 2 });
  });
  it('bo\'sh reja - null; hammasi xato - soni 0 va xatolar', async () => {
    expect(await paketYigServer([N({ takror: true })], 'P', 'zip', yet())).toBeNull();
    const yx = { diskdan: vi.fn(async () => { throw new Error('x'); }), yasa: vi.fn(async () => { throw new Error('y'); }) };
    const r = await paketYigServer([N()], 'P', 'zip', yx);
    expect(r.soni).toBe(0); expect(r.xatolar.length).toBe(1);
  });
  it('baho: yasaladigan hujjat token, to\'langan/Diskdagi (F-2 dan boshqa) bepul; narx yo\'q - null; hech narsa yechilmaydi', () => {
    const q = [N({ kalit: 'a', fayl_id: null, yasash: true }), N({ kalit: 'b', tolangan: true }), N({ kalit: 'm', tur: 'm29', fayl_id: 5 })];
    const narx = (k: number) => k;
    const x = paketBaho(q, new Set(['a', 'b', 'm']), narx);
    expect(x.tanlangan).toBe(3); expect(x.tolanadigan).toBe(1); expect(x.bepul).toBe(2); expect(x.token).toBeGreaterThan(0);
    expect(paketBaho(q, new Set(['a']), null).token).toBeNull();
    expect(paketBaho(q, new Set(['b']), null).token).toBe(0);
  });
  it('R2 kaliti aktorga bog\'langan; chegara 25 MB', () => {
    const k = paketR2Kalit(7, '123e4567-e89b-12d3-a456-426614174000', 'hujjatlar-paketi.zip');
    expect(paketKalitAktorniki(k, 7)).toBe(true); expect(paketKalitAktorniki(k, 8)).toBe(false);
    expect(paketKalitAktorniki('paket/u7/../u8/x/y.zip', 7)).toBe(false);
    expect(PAKET_BAYT_CHEGARA).toBe(25 * 1024 * 1024);
  });
});
