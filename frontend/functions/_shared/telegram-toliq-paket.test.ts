// @ts-nocheck -- bot «Hujjatlar paketi»: toza orkestrator va chegaralar (tarmoq soxta).
import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { PAKET_TG_CHEGARA, PAKET_YASASH_MAKS, botReja, oySondan, paketBajar, rejaChegarasi, shartnomaOyFiltri } from './telegram-toliq-paket';
import { TARKIB_FAYL_NOMI } from '../../src/lib/f2-oylik-paket/eksport';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { yasashSorovi } from '../../src/lib/hujjat-paket/yasash-sorov';

const N = (o = {}) => ({
  kalit: 'f2:1', tur: 'f2', sarlavha: 'F-2 № 1', holat: 'tasdiqlangan', loyiha_id: 1, loyiha_nom: 'L', shartnoma_id: 3, shartnoma_raqam: '7', obyekt_id: 5, obyekt_nom: 'Obyekt',
  oy: '2031-03', akt_id: 1, forma3_id: null, taxminiy: false, takror: false, qator_soni: 10, fayl_id: 11, versiya: 2, bayt: 1000, yasash: false, ...o,
});
const yet = (o = {}) => ({
  diskdan: vi.fn(async (n) => ({ bytes: new Uint8Array([1, 2, 3, n.fayl_id ?? 0]), faylNomi: `${n.kalit.replace(':', '_')}.xlsx` })),
  yasa: vi.fn(async (n) => ({ bytes: new Uint8Array([9, 9]), faylNomi: `${n.kalit.replace(':', '_')}_yangi.xlsx` })), ...o,
});

describe('bot hujjat paketi', () => {
  it('shartnoma + oy filtri va oy kodlash', () => {
    expect(shartnomaOyFiltri(3, '2031-03')).toEqual({ shartnoma_ids: [3], oy_dan: '2031-03', oy_gacha: '2031-03' });
    expect(oySondan(203103)).toBe('2031-03'); expect(oySondan(203113)).toBeNull(); expect(oySondan(1)).toBeNull();
  });
  it('reja: qoralama kirmaydi, taxminiy rad, Diskdagi - bepul, yo\'qlari - yasash', () => {
    const r = botReja([N(), N({ kalit: 'f2:2', fayl_id: null, yasash: true, akt_id: 2 }), N({ kalit: 'f2:3', holat: 'qoralama', akt_id: 3 }), N({ kalit: 'f2:4', taxminiy: true, akt_id: 4 })]);
    expect(r.diskdan.map((x) => x.kalit)).toEqual(['f2:1']); expect(r.yasash.map((x) => x.kalit)).toEqual(['f2:2']);
    expect(r.hujjatlar.some((x) => x.kalit === 'f2:3')).toBe(false); expect(r.rad.map((x) => x.nomzod.kalit)).toContain('f2:4');
  });
  it('chegaralar: bo\'sh, ko\'p yasash, ko\'p hujjat', () => {
    expect(rejaChegarasi(botReja([]))).toBe('bosh');
    const kop = Array.from({ length: PAKET_YASASH_MAKS + 1 }, (_, i) => N({ kalit: `f2:${i}`, akt_id: i + 1, fayl_id: null, yasash: true }));
    expect(rejaChegarasi(botReja(kop))).toBe('kop_yasash');
    const yetmish = Array.from({ length: 61 }, (_, i) => N({ kalit: `f2:${i}`, akt_id: i + 1 }));
    expect(rejaChegarasi(botReja(yetmish))).toBe('kop');
    expect(rejaChegarasi(botReja([N()]))).toBeNull();
  });
  it('yasash so\'rovi sayt bilan bir xil funksiya', () => {
    expect(yasashSorovi(N())).toEqual({ tur: 'f2', parametrlar: { akt_id: 1 } });
    expect(yasashSorovi(N({ tur: 'm29', oy: '2031-03' }))).toEqual({ tur: 'm29', parametrlar: { oy_son: 203103 } });
    expect(yasashSorovi(N({ tur: 'aosr' }))).toBeNull();
  });
  it('paketBajar: Disk (bepul) + yasash -> ZIP (tarkib bilan) -> yuboriladi', async () => {
    const y = yet(); const yubor = vi.fn(async () => true);
    const r = await paketBajar([N(), N({ kalit: 'f2:2', akt_id: 2, fayl_id: null, yasash: true })], 'Hujjatlar paketi', { yet: y, yubor });
    expect(r).toMatchObject({ holat: 'yuborildi', soni: 2, xato: 0 });
    expect(y.diskdan).toHaveBeenCalledTimes(1); expect(y.yasa).toHaveBeenCalledTimes(1);
    const [bayt, nom] = yubor.mock.calls[0];
    expect(nom).toBe('Hujjatlar_paketi.zip');
    const z = unzipSync(bayt);
    expect(Object.keys(z).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(z)).toContain(TARKIB_FAYL_NOMI);
    expect(strFromU8(z[TARKIB_FAYL_NOMI])).toContain('F-2');
  });
  it('bitta hujjat olinmasa paket to\'xtamaydi (xato soni); hammasi yo\'q - bosh', async () => {
    const y = yet({ diskdan: vi.fn(async (n) => { if (n.kalit === 'f2:2') throw new Error('x'); return { bytes: new Uint8Array([1]), faylNomi: 'a.xlsx' }; }) });
    const yubor = vi.fn(async () => true);
    expect(await paketBajar([N(), N({ kalit: 'f2:2', akt_id: 2, fayl_id: 12 })], 'P', { yet: y, yubor })).toMatchObject({ holat: 'yuborildi', soni: 1, xato: 1 });
    const bosh = yet({ diskdan: vi.fn(async () => { throw new Error('x'); }) });
    expect((await paketBajar([N()], 'P', { yet: bosh, yubor })).holat).toBe('bosh');
  });
  it('Telegram chegarasi: katta ZIP yuborilmaydi (katta), yuborish xatosi - yuborilmadi; chegaradan oshgan reja yasalmaydi', async () => {
    expect(PAKET_TG_CHEGARA).toBeLessThanOrEqual(50 * 1024 * 1024);
    const katta = yet({ diskdan: vi.fn(async () => { const b = new Uint8Array(1024 * 1024); crypto.getRandomValues(b.subarray(0, 65536)); for (let i = 65536; i < b.length; i += 65536) crypto.getRandomValues(b.subarray(i, i + 65536)); return { bytes: b, faylNomi: 'k.xlsx' }; }) });
    const yubor = vi.fn(async () => true);
    const kop = Array.from({ length: 3 }, (_, i) => N({ kalit: `f2:${i}`, akt_id: i + 1, fayl_id: i + 1 }));
    expect((await paketBajar(kop, 'P', { yet: katta, yubor })).holat).toBe('yuborildi');
    expect((await paketBajar([N()], 'P', { yet: yet(), yubor: async () => false })).holat).toBe('yuborilmadi');
    const y = yet(); const k = Array.from({ length: PAKET_YASASH_MAKS + 1 }, (_, i) => N({ kalit: `f2:${i}`, akt_id: i + 1, fayl_id: null, yasash: true }));
    expect((await paketBajar(k, 'P', { yet: y, yubor })).holat).toBe('chegara'); expect(y.yasa).not.toHaveBeenCalled();
  });
  it('callback_data <= 64 bayt va menyu/yo\'naltirgich ulangan', async () => {
    for (const d of ['g:pzm:999999999999:999999999999:203103', 'g:pzf:999999999999:999999999999', 'g:pm:999999999999:999999999999:203103']) expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
    const yo = readFileSync(join(process.cwd(), 'functions/_shared/telegram-toliq.ts'), 'utf8');
    for (const p of ["'g:pk:'", "'g:ps:'", "'g:pc:'", "'g:pm:'", "'g:pf:'", "'g:pzm:'", "'g:pzf:'"]) expect(yo).toContain(p);
    expect(readFileSync(join(process.cwd(), 'functions/_shared/telegram-toliq-yadro.ts'), 'utf8')).toContain("'g:pk'");
  });
});
