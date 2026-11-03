import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import {
  izFarqi, manifestQur, obyektPapkaNomi, shartnomaObyektlari, shartnomaPaketYigish, sha256Hex, tayyorgarlikHisobla, topshirilganDanKeyinOzgargan,
  type KirishFayl, type OyIz,
} from './shartnoma';
import { paketTarkibiMatni, paketZip, tarkibBaytlari, TARKIB_FAYL_NOMI } from './eksport';
import type { PaketAkt } from './oylik';

const b = (s: string) => new TextEncoder().encode(s);
const akt = (id: number, obyekt: number, bosqich: PaketAkt['bosqich'], extra: Partial<PaketAkt> = {}): PaketAkt => ({
  akt: { id, obyekt_id: obyekt, oy: '2026-03-01', raqam: String(id), holat: bosqich === 'tasdiqlangan' ? 'tasdiqlangan' : 'qoralama', lifecycle_status: null, hujjat_jami: 10, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' },
  obyektNom: `O${obyekt}`, loyiha: null, bosqich, moliya: { ustamasiz: 10, ustamali: 11, taxminiy: false, nds: 1, jami: 12, narxsizQator: 0, qatorSoni: 1, sabab: null }, moliyaXato: false, uchastkalar: 1, ...extra,
});

describe('shartnoma obyektlari va ZIP papkalari', () => {
  it('shartnomaga bog‘langan obyektlar nomi bo‘yicha', () => {
    const sh = { id: 5, raqam: 'T-1', nom: null, jami_nds_bilan: null, summa_bez_nds: null };
    const m = { obyektlar: [{ id: 2, nom: 'B', loyiha_id: null, jami: null, narxsiz: null }, { id: 1, nom: 'A', loyiha_id: null, jami: null, narxsiz: null }, { id: 3, nom: 'C', loyiha_id: null, jami: null, narxsiz: null }],
      shartnomalar: new Map([[1, [sh]], [2, [sh]]]) };
    expect(shartnomaObyektlari(m, 5).map((o) => o.id)).toEqual([1, 2]);
    expect(shartnomaObyektlari(m, 99)).toEqual([]);
  });

  it('har obyekt o‘z papkasida, shartnoma fayllari ildizda, takror nom _2', () => {
    const f2 = (nom: string, id: number): KirishFayl => ({ nom, bytes: b(nom), tur: 'f2', obyektId: id });
    const fayllar = shartnomaPaketYigish({
      obyektlar: [{ id: 2, nom: 'Boshqa/obyekt' }, { id: 1, nom: 'Alfa' }, { id: 3, nom: 'Bo‘sh' }],
      obyektFayllari: new Map([[1, [f2('F2.xlsx', 1), f2('F2.xlsx', 1)]], [2, [f2('F2.xlsx', 2)]]]),
      shartnomaFayllari: [{ nom: 'reestr.xlsx', bytes: b('r'), tur: 'reestr' }, { nom: 'sverka.xlsx', bytes: b('s'), tur: 'sverka' }],
    });
    expect(fayllar.map((f) => f.yol)).toEqual(['reestr.xlsx', 'sverka.xlsx', 'Alfa/F2.xlsx', 'Alfa/F2_2.xlsx', 'Boshqa obyekt/F2.xlsx']);
    expect(fayllar.filter((f) => f.obyektId == null).map((f) => f.tur)).toEqual(['reestr', 'sverka']);
    expect(fayllar.find((f) => f.yol.startsWith('Boshqa'))?.obyektId).toBe(2);
  });

  it('bir xil nomli obyektlar id bilan ajratiladi', () => {
    expect(obyektPapkaNomi('Obyekt', 7, new Set(['obyekt']))).toBe('Obyekt (7)');
    expect(obyektPapkaNomi('  ', 7, new Set())).toBe('obyekt_7');
  });

  it('ZIP: fayllar papkalar bilan + ПАКЕТ_СОСТАВ.txt ildizda, manifest xeshlari ZIP ichidagi baytlarga teng', async () => {
    const fayllar = shartnomaPaketYigish({
      obyektlar: [{ id: 1, nom: 'Alfa' }],
      obyektFayllari: new Map([[1, [{ nom: 'F2.xlsx', bytes: b('f2-bytes'), tur: 'f2' as const, obyektId: 1 }]]]),
      shartnomaFayllari: [{ nom: 'reestr.xlsx', bytes: b('reestr-bytes'), tur: 'reestr' }],
    });
    const tarkib = paketTarkibiMatni({ oy: '2026-03', fayllar, tekshiruvlar: [], otkazilgan: [], shartnoma: { raqam: 'T-1' } });
    const m = await manifestQur({ oy: '2026-03', shartnoma: { id: 5, raqam: 'T-1' }, fayllar, tarkib: { yol: TARKIB_FAYL_NOMI, bytes: tarkibBaytlari(tarkib) },
      aktlar: [akt(1, 1, 'tasdiqlangan')], obyektlar: [{ id: 1, nom: 'Alfa' }], tayyorgarlik: [], kirmadi: [] });
    const zip = unzipSync(paketZip(fayllar, tarkib));
    expect(Object.keys(zip).sort()).toEqual([TARKIB_FAYL_NOMI, 'Alfa/F2.xlsx', 'reestr.xlsx'].sort());
    expect(tarkib).toContain('ПАКЕТ ПО ДОГОВОРУ № T-1 ЗА 2026-03');
    for (const f of m.fayllar) expect(f.sha256).toBe(await sha256Hex(zip[f.yol])); // manifest = ZIP ichidagi aynan bayt
    expect(m.fayllar.map((f) => f.tur).sort()).toEqual(['f2', 'reestr', 'tarkib']);
    expect(m.aktlar).toEqual([{ akt_id: 1, obyekt_id: 1, raqam: '1', bosqich: 'tasdiqlangan' }]);
    expect(m.format).toBe('t2-shartnoma-oylik-paket/1');
  });
});

describe('tayyorgarlik (hech narsa bloklanmaydi)', () => {
  const ob = [{ id: 1, nom: 'A' }, { id: 2, nom: 'B' }, { id: 3, nom: 'C' }];
  it('holatlar: fakt, F2, nakopitelniy, M-29, summa, Forma-3', () => {
    const r = tayyorgarlikHisobla({
      obyektlar: ob,
      aktlar: [akt(1, 1, 'tasdiqlangan'), akt(2, 2, 'jarayonda'), akt(3, 3, 'tasdiqlangan', { moliya: { ustamasiz: 10, ustamali: null, taxminiy: false, nds: null, jami: null, narxsizQator: 2, qatorSoni: 3, sabab: null } }), akt(4, 3, 'jarayonda')],
      faktSoni: new Map([[1, 4], [2, 0]]), m29: new Map([[1, 'bajarildi'], [2, 'yoq']]), forma3: { tayyor: 0, qoralama: 1 },
      tekshiruvlar: [{ kod: 'summa_nomalum', aktId: 3, obyektNom: 'C', raqam: '3', tafsilot: 'narxsiz' }],
    });
    const [a, b2, c] = r.qatorlar;
    expect([a.fakt.holat, a.f2.holat, a.nakopitelniy.holat, a.m29.holat, a.summa.holat]).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect([b2.fakt.holat, b2.f2.holat, b2.nakopitelniy.holat, b2.m29.holat]).toEqual(['yoq', 'ogoh', 'ogoh', 'yoq']);
    expect(b2.f2.izoh).toBe('faqat qoralama');
    expect([c.fakt.holat, c.f2.holat, c.m29.holat, c.summa.holat]).toEqual(['nom', 'ogoh', 'nom', 'ogoh']); // tasdiqlangan + qoralama aralash; narxsiz qator
    expect(a.forma3.holat).toBe('ogoh'); // faqat qoralama
    expect(r.shartnoma.forma3.holat).toBe('ogoh');
  });
  it('F2 yo‘q obyekt: ✗, summa tegishli emas; Forma-3 hali o‘qilmagan — noma’lum; hisoblanmagan summa — noma’lum', () => {
    const r = tayyorgarlikHisobla({ obyektlar: [ob[0], ob[1]], aktlar: [akt(1, 1, 'tasdiqlangan', { moliya: null })], faktSoni: new Map(), m29: new Map(), forma3: null, tekshiruvlar: [] });
    expect(r.qatorlar[1].f2.holat).toBe('yoq');
    expect(r.qatorlar[1].nakopitelniy.holat).toBe('yoq');
    expect(r.qatorlar[1].summa.holat).toBe('na');
    expect(r.qatorlar[0].summa.holat).toBe('nom');
    expect(r.qatorlar[0].forma3.holat).toBe('nom');
    expect(tayyorgarlikHisobla({ obyektlar: [ob[0]], aktlar: [], faktSoni: new Map(), m29: new Map(), forma3: { tayyor: 2, qoralama: 0 }, tekshiruvlar: [] }).qatorlar[0].forma3.holat).toBe('ok');
  });
});

describe('o‘zgarish izi: topshirilgandan keyin', () => {
  const iz = (): OyIz[] => [
    { obyekt_id: 1, f2: [{ akt_id: 10, versiya: 1, holat: 'qoralama', lifecycle: 'draft' }], fakt: { soni: 2, maks_id: 7, xesh: 'aa' } },
    { obyekt_id: 2, f2: [], fakt: { soni: 0, maks_id: null, xesh: '' } },
  ];
  it('o‘zgarish yo‘q', () => {
    expect(izFarqi(iz(), iz())).toEqual([]);
    expect(topshirilganDanKeyinOzgargan(iz(), iz())).toBe(false);
  });
  it('F2 tasdiqlandi / versiyasi o‘zgardi / yangi F2', () => {
    const h = iz(); h[0].f2[0] = { akt_id: 10, versiya: 2, holat: 'tasdiqlangan', lifecycle: 'approved' };
    expect(izFarqi(iz(), h)).toEqual([{ obyektId: 1, sabab: 'f2' }]);
    const y = iz(); y[1].f2.push({ akt_id: 11, versiya: 1, holat: 'qoralama', lifecycle: 'draft' });
    expect(izFarqi(iz(), y)).toEqual([{ obyektId: 2, sabab: 'f2' }]);
  });
  it('fakt qo‘shildi', () => {
    const h = iz(); h[1].fakt = { soni: 1, maks_id: 9, xesh: 'bb' };
    expect(izFarqi(iz(), h)).toEqual([{ obyektId: 2, sabab: 'fakt' }]);
  });
  it('obyekt qo‘shildi / chiqdi; iz yo‘q — yolg‘on belgi qo‘yilmaydi', () => {
    expect(izFarqi(iz(), [iz()[0]])).toEqual([{ obyektId: 2, sabab: 'obyekt_chiqdi' }]);
    expect(izFarqi([iz()[0]], iz())).toEqual([{ obyektId: 2, sabab: 'obyekt_qoshildi' }]);
    expect(izFarqi(undefined, iz())).toEqual([]);
    expect(izFarqi(iz(), null)).toEqual([]);
  });
});
