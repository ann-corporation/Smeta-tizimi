import { describe, expect, it, vi } from 'vitest';
import type { MindmapGraf } from '../api/t2-mindmap';
import { daraxtQur } from './mindmap-korinish';
import {
  GURUH_LOYIHASIZ, boshlangichYoyilgan, keyingiQadam, nomlarniAjrat, pultBelgilari, pultDaraxtQur, pultQatorlari, pultQidiruvi, takrorsizMuammolar,
  type PultTugun,
} from './mindmap-pult-daraxt';
import {
  PULT_AMALLAR, grafgaYamoq, pultAmallari, pultAsboblar, pultNishon, pultTayyorla, type PultKontekst, type PultYozuvchi,
} from './mindmap-pult';

const UZUN = 'Yevropa oshxona va mehmonxona majmuasi qurilishi, 1-bosqich, 2-blok (asosiy bino)';

function graf(): MindmapGraf {
  return {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: null, x: null, y: null },
      { id: 'loyiha:7', tur: 'loyiha', nom: 'Navoiy bog‘i', meta: { versiya: 3 }, x: null, y: null },
      { id: 'shartnoma:3', tur: 'shartnoma', nom: '№12/А', meta: { versiya: 2, loyiha_id: 7, tomonlar: [{ rol: 'zakazchik', nom: 'Buyurtmachi MChJ', kontragent_id: 9 }] }, x: null, y: null },
      // Ikki obyekt bir xil UZUN nom bilan — ular bir xil ko‘rinmasligi va nomi kesilmasligi kerak.
      { id: 'obyekt:5', tur: 'obyekt', nom: UZUN, x: null, y: null, meta: { versiya: 4, loyiha_id: 7, smeta: 1000, fakt: 600, f2: 400, fakt_foiz: 60, f2_foiz: 40, signal_count: 3, critical_count: 0,
        top_signals: [{ title: 'Smeta qatori metadata tekshiruvdan o‘tmadi', severity: 'warning' }, { title: 'Smeta qatori metadata tekshiruvdan o‘tmadi', severity: 'warning' }, { title: 'Smeta qatori metadata tekshiruvdan o‘tmadi', severity: 'warning' }],
        belgi: [{ tur: 'zayavka', daraja: 'info', matn: '2 ta zayavka kutilmoqda', soni: 2 }] } },
      { id: 'obyekt:6', tur: 'obyekt', nom: UZUN, x: null, y: null, meta: { versiya: 1, loyiha_id: 7, smeta: null, fakt: 0, f2: 0, fakt_foiz: null, f2_foiz: null, belgi: [{ tur: 'smeta_yoq', daraja: 'ogoh', matn: 'Smeta yuklanmagan' }] } },
      { id: 'obyekt:8', tur: 'obyekt', nom: 'Loyihasiz obyekt', x: null, y: null, meta: { versiya: 2, smeta: 10, fakt: 0, f2: 0, fakt_foiz: 0, f2_foiz: 0, belgi: [] } },
      { id: 'kontragent:9', tur: 'kontragent', nom: 'Buyurtmachi MChJ', meta: { versiya: 1 }, x: null, y: null },
      { id: 'kontragent:10', tur: 'kontragent', nom: 'Subpudrat MChJ', meta: { versiya: 1 }, x: null, y: null },
      { id: 'sklad:2', tur: 'sklad', nom: 'Markaziy ombor', meta: { versiya: 1 }, x: null, y: null },
      { id: 'kadr:4', tur: 'kadr', nom: 'Aliyev A. (prorab)', meta: { versiya: 1, lavozim: 'Prorab' }, x: null, y: null },
    ],
    bogichlar: [
      { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'loyiha:7', maqsad: 'shartnoma:3', tur: 'shartnoma_loyiha', uzsa_boladi: true },
      { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'loyiha:7', maqsad: 'obyekt:6', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'shartnoma:3', maqsad: 'obyekt:5', tur: 'shartnoma_obyekt', uzsa_boladi: true },
      { manba: 'kontragent:10', maqsad: 'loyiha:7', tur: 'qatnashchi', uzsa_boladi: true, rol: 'subpudratchi' },
      { manba: 'sklad:2', maqsad: 'obyekt:5', tur: 'sklad_obyekt', uzsa_boladi: true },
    ],
  };
}

const ildizQur = (g = graf()) => pultDaraxtQur(g, daraxtQur(g));
const top = (t: PultTugun, kalit: string): PultTugun | undefined => (t.kalit === kalit ? t : t.bolalar.map((b) => top(b, kalit)).find(Boolean));

function yozuvchi(): PultYozuvchi & { chaqiruvlar: [string, unknown[]][] } {
  const chaqiruvlar: [string, unknown[]][] = [];
  const f = (nom: string, javob: object = { ok: true }) => vi.fn(async (...a: unknown[]) => { chaqiruvlar.push([nom, a]); return javob; });
  return {
    chaqiruvlar,
    loyihaYarat: f('loyihaYarat', { ok: true, id: 11 }), obyektYarat: f('obyektYarat', { ok: true, id: 12 }), shartnomaYarat: f('shartnomaYarat', { ok: true, id: 13, versiya: 1 }),
    bog: f('bog'), bogOchir: f('bogOchir'), loyihaNomla: f('loyihaNomla'), obyektNomla: f('obyektNomla'), imzochiSaqla: f('imzochiSaqla'),
  } as unknown as PultYozuvchi & { chaqiruvlar: [string, unknown[]][] };
}
const OCHIQ = { mumkin: true, sabab: null } as const;
const kontekst = (y: PultYozuvchi, tahrir: PultKontekst['tahrir'] = OCHIQ): PultKontekst => ({ tahrir, yozuvchi: y });

describe('pult daraxti: kompaniya → loyiha → shartnoma → obyekt', () => {
  it('shartnoma loyiha ostida, shartnomali obyekt shartnoma ostida, shartnomasiz — loyiha ostida; loyihasiz — guruhda', () => {
    const r = ildizQur();
    const loyiha = top(r, 'loyiha:7')!;
    expect(loyiha.bolalar.map((b) => b.id)).toEqual(['shartnoma:3', 'obyekt:6']);
    expect(loyiha.bolalar[0].bolalar.map((b) => b.id)).toEqual(['obyekt:5']);
    const guruh = top(r, GURUH_LOYIHASIZ)!;
    expect(guruh.bolalar.map((b) => b.id)).toEqual(['obyekt:8']);
    expect(r.obyektSoni).toBe(3);
  });

  it('nomlar KESILMAYDI: to‘liq nom saqlanadi, bir xil nomlar (turli shoxda ham) identifikator bilan ajraladi', () => {
    const g = graf();
    // Ikkala obyekt bir loyiha ostida, shartnomasiz — qardosh.
    g.bogichlar = g.bogichlar.filter((b) => b.tur !== 'shartnoma_obyekt');
    const r = ildizQur(g);
    const q = top(r, 'loyiha:7')!.bolalar.filter((b) => b.tur === 'obyekt');
    expect(q.map((b) => b.nom)).toEqual([UZUN, UZUN]);
    expect(new Set(q.map((b) => b.nomAniq)).size).toBe(2);
    expect(q.every((b) => b.nomAniq.startsWith(UZUN))).toBe(true);
  });

  it('nomlarniAjrat: bir xil bo‘lmagan nomlarga tegmaydi', () => {
    const a = { nom: 'A', id: 'obyekt:1', nomAniq: 'A' } as PultTugun;
    const b = { nom: 'B', id: 'obyekt:2', nomAniq: 'B' } as PultTugun;
    nomlarniAjrat([a, b]);
    expect([a.nomAniq, b.nomAniq]).toEqual(['A', 'B']);
  });

  it('yon bog‘lanishlar: tomonlar, subpudratchi, sklad; shartnomada — meta.tomonlar', () => {
    const r = ildizQur();
    const loyiha = top(r, 'loyiha:7')!;
    expect(loyiha.yonlar).toEqual([{ tur: 'subpudrat', nom: 'Subpudrat MChJ', rol: 'subpudratchi', tugunId: 'kontragent:10' }]);
    expect(top(r, 'loyiha:7/shartnoma:3')!.yonlar[0]).toMatchObject({ tur: 'tomon', nom: 'Buyurtmachi MChJ', rol: 'zakazchik' });
    expect(top(r, 'loyiha:7/shartnoma:3/obyekt:5')!.yonlar.map((y) => y.tur)).toEqual(['sklad']);
  });

  it('boshlang‘ich yoyish: obyektdan tashqari hammasi; qatorlar yoyilganiga qarab', () => {
    const r = ildizQur();
    const y = boshlangichYoyilgan(r);
    expect(y.has('loyiha:7/shartnoma:3/obyekt:5')).toBe(false);
    const q = pultQatorlari(r, y);
    expect(q.map((x) => x.t.id)).toEqual(['kompaniya:1', 'loyiha:7', 'shartnoma:3', 'obyekt:5', 'obyekt:6', GURUH_LOYIHASIZ, 'obyekt:8']);
    expect(pultQatorlari(r, new Set()).length).toBe(1);
  });

  it('qidiruv: mos obyekt + ajdodlari; holat filtri', () => {
    const r = ildizQur();
    const mos = (matn: string, s: string) => matn.toLocaleLowerCase('uz-UZ').includes(s.toLocaleLowerCase('uz-UZ'));
    expect(pultQidiruvi(r, '', mos, null)).toBeNull();
    const s = pultQidiruvi(r, 'loyihasiz obyekt', mos, null)!;
    expect(s.has('obyekt:8') || [...s].some((k) => k.endsWith('obyekt:8'))).toBe(true);
    expect([...s].some((k) => k.includes('obyekt:5'))).toBe(false);
    const x = pultQidiruvi(r, '', mos, 'xavf')!;
    expect([...x].some((k) => k.endsWith('obyekt:6'))).toBe(true); // smeta yo‘q — xavf
    expect([...x].some((k) => k.endsWith('obyekt:5'))).toBe(false);
  });
});

describe('pult belgilari: yagona hisobdan, takrorsiz', () => {
  it('bir xil signal matni uch marta emas, bitta qatorda ×3', () => {
    const r = ildizQur();
    const b = pultBelgilari(top(r, 'loyiha:7/shartnoma:3/obyekt:5')!.x)!;
    const m = b.muammolar.find((q) => q.matn.startsWith('Smeta qatori'))!;
    expect(m.soni).toBe(3);
    expect(b.muammolar.filter((q) => q.matn.startsWith('Smeta qatori'))).toHaveLength(1);
  });

  it('qoldiq = smeta − F2 (yadro formulasi); smeta noma’lum — null (0 emas)', () => {
    const r = ildizQur();
    expect(pultBelgilari(top(r, 'loyiha:7/shartnoma:3/obyekt:5')!.x)!.qoldiq).toBe(600);
    expect(pultBelgilari(top(r, 'loyiha:7/obyekt:6')!.x)!.qoldiq).toBeNull();
    expect(pultBelgilari(null)).toBeNull();
  });

  it('takrorsizMuammolar: belgi + signal birlashadi, og‘irlari oldin', () => {
    const q = takrorsizMuammolar([{ tur: 'zayavka', daraja: 'info', matn: 'X', soni: 2 }], [{ title: 'x', severity: 'critical' }, { title: 'Y', severity: 'low' }]);
    expect(q[0]).toMatchObject({ matn: 'X', soni: 3, ogoh: true });
    expect(q).toHaveLength(2);
  });

  it('keyingi qadam: smeta → fakt → F2 → F3 → АОСР (faqat yo‘naltiradi)', () => {
    const r = ildizQur();
    const nom = (k: string) => k;
    const x5 = top(r, 'loyiha:7/shartnoma:3/obyekt:5')!.x!;
    expect(keyingiQadam(top(r, 'loyiha:7/obyekt:6')!.x, 6, nom)).toMatchObject({ kalit: 'smeta', yol: '/admin/holat/6?panel=smeta' });
    expect(keyingiQadam(x5, 5, nom)).toMatchObject({ kalit: 'f2', yol: '/admin/f2-tayyorlash?obyekt=5' }); // fakt 60% > F2 40%
    expect(keyingiQadam({ ...x5, faktFoiz: 40, f2Foiz: 40, f2Tasdiqlangan: true }, 5, nom)).toMatchObject({ kalit: 'f3', yol: '/admin/nakopitelniy?obyekt=5' });
    expect(keyingiQadam({ ...x5, fakt: 0 }, 5, nom)?.kalit).toBe('fakt');
    expect(keyingiQadam(null, 5, nom)).toBeNull();
  });
});

describe('pult amallari: nishon, ruxsat, ko‘rinish', () => {
  it('nishon graf faktlaridan: versiya, loyiha va shartnoma', () => {
    expect(pultNishon(graf(), 'obyekt:5')).toMatchObject({ tur: 'obyekt', entityId: 5, versiya: 4, loyihaId: 7, shartnomaId: 3 });
    expect(pultNishon(graf(), 'obyekt:8')).toMatchObject({ loyihaId: null, shartnomaId: null });
    expect(pultNishon(graf(), 'sklad:2')).toBeNull();
  });

  it('reestr kalitlari yagona; har amalning maydonlari va tayyorlovchisi bor', () => {
    expect(new Set(PULT_AMALLAR.map((a) => a.kalit)).size).toBe(PULT_AMALLAR.length);
    expect(pultAsboblar().map((a) => a.nom)).toEqual(PULT_AMALLAR.map((a) => 'mindmap.' + a.kalit));
    expect(pultAsboblar().every((a) => a.yozadi)).toBe(true);
  });

  it('holatga qarab mos amallar chiqadi (shartnomali obyektda «biriktirish» yo‘q, «ajratish» bor)', () => {
    const g = graf();
    const kalit = (id: string, t = OCHIQ) => pultAmallari(g, pultNishon(g, id), t).map((a) => a.kalit);
    expect(kalit('obyekt:5')).toEqual(expect.arrayContaining(['obyekt.shartnoma-uz', 'obyekt.loyiha-uz', 'obyekt.resurs-biriktir', 'obyekt.resurs-uz', 'obyekt.nomla']));
    expect(kalit('obyekt:5')).not.toContain('obyekt.shartnoma-biriktir');
    expect(kalit('obyekt:8')).toEqual(expect.arrayContaining(['obyekt.shartnoma-biriktir', 'obyekt.loyiha-biriktir']));
    expect(kalit('obyekt:8')).not.toContain('obyekt.loyiha-uz');
    expect(kalit('kompaniya:1')).toEqual(['loyiha.yarat']);
    expect(kalit('loyiha:7')).toEqual(expect.arrayContaining(['obyekt.yarat', 'shartnoma.yarat', 'obyekt.biriktir', 'tomon.biriktir', 'tomon.uz', 'loyiha.nomla']));
    expect(kalit('shartnoma:3')).toEqual(['shartnoma.obyekt-biriktir']);
  });

  it('ruxsat yo‘q: amallar KO‘RINADI lekin yopiq (sabab bilan); tayyorlash rad etiladi, yozuvchi chaqirilmaydi', async () => {
    const g = graf(), y = yozuvchi();
    const yopiq = { mumkin: false, sabab: 'ruxsat_yoq' } as const;
    const amallar = pultAmallari(g, pultNishon(g, 'loyiha:7'), yopiq);
    expect(amallar.length).toBeGreaterThan(0);
    expect(amallar.every((a) => !a.mumkin && /document\.write/.test(a.sabab ?? ''))).toBe(true);
    const r = pultTayyorla(g, 'kompaniya:1', 'loyiha.yarat', { nom: 'Yangi' }, kontekst(y, yopiq));
    expect(r.ok).toBe(false);
    expect(y.chaqiruvlar).toEqual([]);
    // Rahbar roli ham yozolmaydi.
    const rahbar = pultTayyorla(g, 'kompaniya:1', 'loyiha.yarat', { nom: 'Yangi' }, kontekst(y, { mumkin: false, sabab: 'rahbar' }));
    expect(rahbar.ok).toBe(false);
  });
});

describe('pult amallari: to‘g‘ri buyruq + tasdiqdan OLDIN hech narsa yozilmaydi', () => {
  const tayyor = (g: MindmapGraf, id: string, kalit: string, q: Record<string, string>, y: PultYozuvchi) => {
    const r = pultTayyorla(g, id, kalit, q, kontekst(y));
    if (!r.ok) throw new Error(r.xato);
    return r.reja;
  };

  it('yangi loyiha → loyiha_yarat', async () => {
    const g = graf(), y = yozuvchi();
    const reja = tayyor(g, 'kompaniya:1', 'loyiha.yarat', { nom: ' Yangi bog ', hudud: 'Navoiy' }, y);
    expect(reja.buyruqlar).toEqual(['loyiha_yarat']);
    expect(reja.oqibat.join(' ')).toMatch(/Yangi bog/);
    expect(y.chaqiruvlar).toEqual([]);
    const n = await reja.bajar();
    expect(y.chaqiruvlar).toEqual([['loyihaYarat', ['Yangi bog', 'Navoiy']]]);
    expect(n).toMatchObject({ ok: true, yangiTugunId: 'loyiha:11' });
  });

  it('yangi obyekt loyiha ichida → obyekt_yarat (loyiha id bilan)', async () => {
    const g = graf(), y = yozuvchi();
    const reja = tayyor(g, 'loyiha:7', 'obyekt.yarat', { nom: 'Yangi obyekt' }, y);
    expect(reja.buyruqlar).toEqual(['obyekt_yarat']);
    await reja.bajar();
    expect(y.chaqiruvlar).toEqual([['obyektYarat', [7, 'Yangi obyekt']]]);
  });

  it('yangi shartnoma → shartnoma_saqla, keyin loyihaga mindmap_bog (yangi versiya bilan)', async () => {
    const g = graf(), y = yozuvchi();
    const reja = tayyor(g, 'loyiha:7', 'shartnoma.yarat', { nom: '№99', taraf: 'Zakazchik' }, y);
    expect(reja.buyruqlar).toEqual(['shartnoma_saqla', 'mindmap_bog']);
    const n = await reja.bajar();
    expect(y.chaqiruvlar).toEqual([['shartnomaYarat', ['№99', 'Zakazchik']], ['bog', ['shartnoma_loyiha', 7, 13, 1]]]);
    expect(n.yangiTugunId).toBe('shartnoma:13');
  });

  it('shartnoma yaratildi-yu bog‘lanmadi — jim emas, ogohlantirish qaytadi', async () => {
    const g = graf(), y = yozuvchi();
    (y.bog as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: 'versiya mos emas' });
    const n = await tayyor(g, 'loyiha:7', 'shartnoma.yarat', { nom: '№99' }, y).bajar();
    expect(n.ok).toBe(true);
    expect(n.ogoh).toMatch(/versiya mos emas/);
  });

  it('obyektni shartnomaga biriktirish → mindmap_bog shartnoma_obyekt (OBYEKT versiyasi bilan)', async () => {
    const g = graf(), y = yozuvchi();
    const reja = tayyor(g, 'obyekt:8', 'obyekt.shartnoma-biriktir', { shartnoma: 'shartnoma:3' }, y);
    expect(reja.buyruqlar).toEqual(['mindmap_bog']);
    await reja.bajar();
    expect(y.chaqiruvlar).toEqual([['bog', ['shartnoma_obyekt', 3, 8, 2, undefined]]]);
  });

  it('shartnomadan ajratish → mindmap_bog_ochir; yozuvlar o‘chmasligi aytiladi', async () => {
    const g = graf(), y = yozuvchi();
    const reja = tayyor(g, 'obyekt:5', 'obyekt.shartnoma-uz', {}, y);
    expect(reja.buyruqlar).toEqual(['mindmap_bog_ochir']);
    expect(reja.ogoh.join(' ')).toMatch(/o‘chmaydi/);
    await reja.bajar();
    expect(y.chaqiruvlar).toEqual([['bogOchir', ['shartnoma_obyekt', 3, 5, 4, undefined]]]);
  });

  it('obyektni loyihaga biriktirish / loyihadan chiqarish', async () => {
    const g = graf(), y = yozuvchi();
    await tayyor(g, 'obyekt:8', 'obyekt.loyiha-biriktir', { loyiha: 'loyiha:7' }, y).bajar();
    await tayyor(g, 'obyekt:5', 'obyekt.loyiha-uz', {}, y).bajar();
    expect(y.chaqiruvlar).toEqual([['bog', ['obyekt_loyiha', 7, 8, 2, undefined]], ['bogOchir', ['obyekt_loyiha', 7, 5, 4, undefined]]]);
  });

  it('loyiha tomondan biriktirish: kontragent + rol → qatnashchi (loyiha versiyasi, rol bilan); mavjud juftlik rad', async () => {
    const g = graf(), y = yozuvchi();
    await tayyor(g, 'loyiha:7', 'tomon.biriktir', { kontragent: 'kontragent:9', rol: 'zakazchik' }, y).bajar();
    expect(y.chaqiruvlar).toEqual([['bog', ['qatnashchi', 9, 7, 3, 'zakazchik']]]);
    const qayta = pultTayyorla(g, 'loyiha:7', 'tomon.biriktir', { kontragent: 'kontragent:10', rol: 'subpudratchi' }, kontekst(y));
    expect(qayta.ok).toBe(false);
    const rolsiz = pultTayyorla(g, 'loyiha:7', 'tomon.biriktir', { kontragent: 'kontragent:9', rol: 'noma‘lum' }, kontekst(y));
    expect(rolsiz.ok).toBe(false);
  });

  it('tomonni uzish → mindmap_bog_ochir qatnashchi rol bilan', async () => {
    const g = graf(), y = yozuvchi();
    await tayyor(g, 'loyiha:7', 'tomon.uz', { tomon: 'kontragent:10|subpudratchi' }, y).bajar();
    expect(y.chaqiruvlar).toEqual([['bogOchir', ['qatnashchi', 10, 7, 3, 'subpudratchi']]]);
  });

  it('sklad/xodim (imzochi) biriktirish va uzish → sklad_obyekt / kadr_obyekt', async () => {
    const g = graf(), y = yozuvchi();
    await tayyor(g, 'obyekt:5', 'obyekt.resurs-biriktir', { resurs: 'kadr:4' }, y).bajar();
    await tayyor(g, 'obyekt:5', 'obyekt.resurs-uz', { resurs: 'sklad:2' }, y).bajar();
    expect(y.chaqiruvlar).toEqual([['bog', ['kadr_obyekt', 4, 5, 4, undefined]], ['bogOchir', ['sklad_obyekt', 2, 5, 4, undefined]]]);
    // Allaqachon biriktirilgan sklad nomzod emas.
    const maydon = PULT_AMALLAR.find((a) => a.kalit === 'obyekt.resurs-biriktir')!.maydonlar[0];
    expect(maydon.tanlovlar!(g, pultNishon(g, 'obyekt:5')!).map((v) => v.qiymat)).toEqual(['kadr:4']);
  });

  it('imzochi tayinlash/olib tashlash → imzochi_saqla (obyekt darajasi); majburiy maydonlar', async () => {
    const g = graf(), y = yozuvchi();
    const r = tayyor(g, 'obyekt:5', 'obyekt.imzochi-biriktir', { rol: 'pudratchi', fio: ' Aliyev A. ', lavozim: 'Direktor' }, y);
    expect(r.buyruqlar).toEqual(['imzochi_saqla']);
    expect(y.chaqiruvlar).toEqual([]);
    await r.bajar();
    await tayyor(g, 'obyekt:5', 'obyekt.imzochi-uz', { rol: 'texnadzor' }, y).bajar();
    expect(y.chaqiruvlar).toEqual([['imzochiSaqla', [5, 'pudratchi', { tashkilot: '', lavozim: 'Direktor', fio: 'Aliyev A.' }]], ['imzochiSaqla', [5, 'texnadzor', { tashkilot: '', lavozim: '', fio: '' }]]]);
    expect(pultTayyorla(g, 'obyekt:5', 'obyekt.imzochi-biriktir', { rol: 'pudratchi', fio: '' }, kontekst(y)).ok).toBe(false);
    expect(pultTayyorla(g, 'obyekt:5', 'obyekt.imzochi-biriktir', { rol: 'x', fio: 'A' }, kontekst(y)).ok).toBe(false);
  });

  it('nomlash: loyiha → loyiha_yangila (versiya bilan), obyekt → obyekt_yangila; bir xil nom rad', async () => {
    const g = graf(), y = yozuvchi();
    await tayyor(g, 'loyiha:7', 'loyiha.nomla', { nom: 'Yangi nom' }, y).bajar();
    await tayyor(g, 'obyekt:5', 'obyekt.nomla', { nom: 'Boshqa nom' }, y).bajar();
    expect(y.chaqiruvlar).toEqual([['loyihaNomla', [7, 3, 'Yangi nom']], ['obyektNomla', [5, 'Boshqa nom']]]);
    expect(pultTayyorla(g, 'loyiha:7', 'loyiha.nomla', { nom: 'Navoiy bog‘i' }, kontekst(y)).ok).toBe(false);
  });

  it('majburiy maydon yo‘q yoki versiya kelmagan — rad (yozuv yuborilmaydi)', () => {
    const g = graf(), y = yozuvchi();
    expect(pultTayyorla(g, 'kompaniya:1', 'loyiha.yarat', { nom: '  ' }, kontekst(y)).ok).toBe(false);
    const versiyasiz = graf();
    versiyasiz.tugunlar = versiyasiz.tugunlar.map((t) => (t.id === 'obyekt:8' ? { ...t, meta: { ...t.meta, versiya: undefined } } : t));
    expect(pultTayyorla(versiyasiz, 'obyekt:8', 'obyekt.loyiha-biriktir', { loyiha: 'loyiha:7' }, kontekst(y)).ok).toBe(false);
    expect(pultTayyorla(g, 'obyekt:5', 'loyiha.yarat', { nom: 'x' }, kontekst(y)).ok).toBe(false); // nishon turi mos emas
    expect(y.chaqiruvlar).toEqual([]);
  });

  it('AI asbobi: tayyorla faqat reja qaytaradi (yozmaydi); bajarish alohida', async () => {
    const g = graf(), y = yozuvchi();
    const asbob = pultAsboblar().find((a) => a.nom === 'mindmap.obyekt.yarat')!;
    expect(asbob.parametrlar.map((p) => p.kalit)).toEqual(['tugun_id', 'nom']);
    const r = asbob.tayyorla(g, 'loyiha:7', { nom: 'AI obyekt' }, kontekst(y));
    expect(r.ok).toBe(true);
    expect(y.chaqiruvlar).toEqual([]);
  });
});

describe('optimistik yamoq (sekin RPC kutilmaydi)', () => {
  it('biriktirish chiziq qo‘shadi (eskisini almashtiradi) va maqsad versiyasini +1 qiladi', async () => {
    const g = graf();
    const r = pultTayyorla(g, 'obyekt:5', 'obyekt.shartnoma-uz', {}, kontekst(yozuvchi()));
    if (!r.ok) throw new Error(r.xato);
    const yangi = grafgaYamoq(g, r.reja.yamoq);
    expect(yangi.bogichlar.some((b) => b.tur === 'shartnoma_obyekt' && b.maqsad === 'obyekt:5')).toBe(false);
    expect(yangi.tugunlar.find((t) => t.id === 'obyekt:5')!.meta!.versiya).toBe(5);
    expect(g.tugunlar.find((t) => t.id === 'obyekt:5')!.meta!.versiya).toBe(4); // asl graf o‘zgarmaydi
    const b = pultTayyorla(yangi, 'obyekt:5', 'obyekt.shartnoma-biriktir', { shartnoma: 'shartnoma:3' }, kontekst(yozuvchi()));
    if (!b.ok) throw new Error(b.xato);
    const qayta = grafgaYamoq(yangi, b.reja.yamoq);
    expect(qayta.bogichlar.filter((x) => x.tur === 'shartnoma_obyekt' && x.maqsad === 'obyekt:5')).toHaveLength(1);
    expect(grafgaYamoq(qayta, b.reja.yamoq).bogichlar.length).toBe(qayta.bogichlar.length); // takror qo‘shilmaydi
  });

  it('nomlash yamog‘i nomni almashtiradi; yamoq yo‘q — o‘sha graf', () => {
    const g = graf();
    const r = pultTayyorla(g, 'loyiha:7', 'loyiha.nomla', { nom: 'Yangi nom' }, kontekst(yozuvchi()));
    if (!r.ok) throw new Error(r.xato);
    expect(grafgaYamoq(g, r.reja.yamoq).tugunlar.find((t) => t.id === 'loyiha:7')!.nom).toBe('Yangi nom');
    expect(grafgaYamoq(g, undefined)).toBe(g);
  });
});
