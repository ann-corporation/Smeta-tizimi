import { describe, expect, it } from 'vitest';
import { NAV_SAHIFALAR } from '../nav/navReestr';
import { SAHIFA_SINONIM } from './sinonim';
import { niyatAniqla, type NiyatKontekst } from './niyat';
import { sahifaTopish } from './sahifa-qidiruv';
import { sozlar } from './matn';

const HAMMA = NAV_SAHIFALAR.map((s) => ({ yol: s.yol, nom: s.nom, guruh: s.guruh.nom }));
const OBYEKTLAR = [{ id: 12, nom: 'Yevropa 1' }, { id: 13, nom: 'Amfiteatr' }, { id: 14, nom: 'Fast Food 1-etaj' }, { id: 15, nom: 'Yevropa 10' }];
const ctx = (o: Partial<NiyatKontekst> = {}): NiyatKontekst => ({ sahifalar: HAMMA, obyektlar: OBYEKTLAR, bugun: new Date(2026, 10, 11), ...o });
const nav = (matn: string, c = ctx()) => { const n = niyatAniqla(matn, c); if (n.tur !== 'navigatsiya') throw new Error(`${matn} -> ${n.tur}`); return n; };

describe('yordamchi navigatsiyasi (reestrdan)', () => {
  it('«mindmapni ochib ber» -> /admin/mindmap (egasi skrinshoti)', () => {
    const n = nav('mindmapni ochib ber');
    expect(n.sahifa.yol).toBe('/admin/mindmap');
    expect(n.aniqOchish).toBe(true);
  });
  it('rus va ingliz: «открой майндмап», «open mindmap», «покажи долги», «open debts»', () => {
    expect(nav('открой майндмап').sahifa.yol).toBe('/admin/mindmap');
    expect(nav('open mindmap').sahifa.yol).toBe('/admin/mindmap');
    expect(nav('покажи долги').sahifa.yol).toBe('/admin/qarzdorlik');
    expect(nav('open debts').sahifa.yol).toBe('/admin/qarzdorlik');
  });
  it('«АОСР sahifasi» (kirill+lotin aralash)', () => {
    expect(nav('АОСР sahifasi').sahifa.yol).toBe('/admin/aosr');
    expect(nav('aosr sahifasini och').sahifa.yol).toBe('/admin/aosr');
  });
  it('obyekt konteksti: «Yevropa 1 ning F2 sini och» -> F2 tarixi shu obyekt uchun', () => {
    const n = nav('Yevropa 1 ning F2 sini och');
    expect(n.sahifa.yol).toBe('/admin/f2-tarix');
    expect(n.obyekt?.id).toBe(12);
    expect(n.sahifa.url).toBe('/admin/f2-tarix?obyekt=12');
  });
  it('«Yevropa 1» va «Yevropa 10» aralashmaydi (raqam aniq)', () => {
    expect(nav('Yevropa 10 fakt kiritish').obyekt?.id).toBe(15);
    expect(nav('Yevropa 1 fakt kiritish').obyekt?.id).toBe(12);
  });
  it('obyekt + oy: «Yevropa 1 oktabr oyi F2 tayyorlash» -> ?obyekt=12&oy=2026-10', () => {
    const n = nav('Yevropa 1 oktabr oyi F2 tayyorlashni och');
    expect(n.sahifa.url).toBe('/admin/f2-tayyorlash?obyekt=12&oy=2026-10');
    expect(n.oy).toBe('2026-10');
  });
  it('oy: ru va nisbiy iboralar', () => {
    expect(nav('открой ф2 за сентябрь').oy).toBe('2026-09');
    expect(nav('f2 tarixi otgan oy').oy).toBe('2026-10');
    expect(nav('f2 tarixi joriy oy').oy).toBe('2026-11');
    expect(nav('f2 tarixi 2025-12').oy).toBe('2025-12');
  });
  it('«Smeta va Fakt» + obyekt -> /admin/holat/ID', () => {
    expect(nav('Amfiteatr smeta va fakt sahifasini och').sahifa.url).toBe('/admin/holat/13');
  });
  it('joriy obyekt (PTO scope): nom aytilmasa shu obyekt', () => {
    const n = nav('fakt kiritishni och', ctx({ joriyObyekt: { id: 13, nom: 'Amfiteatr' } }));
    expect(n.sahifa.url).toBe('/admin/fakt?obyekt=13');
  });
  it('F2 qoralama: «F2 qoralamasini tayyorla» sahifaga olib boradi (qoralama belgisi), o‘zi yozmaydi', () => {
    const n = nav('Amfiteatr uchun F2 tayyorla');
    expect(n.sahifa.yol).toBe('/admin/f2-tayyorlash');
    expect(n.qoralama).toBe(true);
  });
  it('noaniq: «smeta» bir nechta sahifaga mos -> tanlash ro‘yxati', () => {
    const n = niyatAniqla('smeta', ctx());
    if (n.tur === 'nomalum') expect(n.yaqin.some((s) => s.yol.startsWith('/admin/smeta') || s.yol === '/admin/holat')).toBe(true);
    else expect(['sahifaTanla', 'navigatsiya']).toContain(n.tur);
  });
});

describe('ruxsat filtri', () => {
  const faqatFakt = HAMMA.filter((s) => s.yol === '/admin/fakt' || s.yol === '/admin/obyektlar');
  it('ruxsatsiz sahifa ochilmaydi — «ruxsat yo‘q» deyiladi', () => {
    const n = niyatAniqla('mindmapni och', ctx({ sahifalar: faqatFakt }));
    expect(n.tur).toBe('ruxsatYoq');
  });
  it('ruxsatli sahifa ochiladi', () => {
    expect(nav('fakt kiritishni och', ctx({ sahifalar: faqatFakt })).sahifa.yol).toBe('/admin/fakt');
  });
  it('sahifaTopish: ruxsatli ro‘yxatda yo‘q sahifa hech qachon `aniq` qaytmaydi', () => {
    const r = sahifaTopish(sozlar('qarzdorlik'), faqatFakt);
    expect(r?.tur).not.toBe('aniq');
  });
});

describe('o‘qish va yozuv niyatlari', () => {
  const joriy = { joriyObyekt: { id: 12, nom: 'Yevropa 1' } };
  it('«narxsiz qatorlarni ko‘rsat» -> o‘qish: narxsiz (joriy obyekt)', () => {
    const n = niyatAniqla('narxsiz qatorlarni ko‘rsat', ctx(joriy));
    expect(n).toMatchObject({ tur: 'oqish', vosita: 'narxsiz', arg: null });
  });
  it('«Amfiteatr qoldiq eng katta ishlar» -> qoldiq, nomlangan obyekt', () => {
    expect(niyatAniqla('Amfiteatr qoldiq eng katta ishlar qaysi', ctx())).toMatchObject({ tur: 'oqish', vosita: 'qoldiq', obyekt: { id: 13 } });
  });
  it('«beton ishlarini top» emas, «top beton» -> qidir', () => {
    expect(niyatAniqla('qidir beton B25', ctx(joriy))).toMatchObject({ tur: 'oqish', vosita: 'qidir', arg: 'beton B25' });
  });
  it('«Yevropa 1 holati» -> holat o‘qish', () => {
    expect(niyatAniqla('Yevropa 1 holati qanday', ctx())).toMatchObject({ tur: 'oqish', vosita: 'holat', obyekt: { id: 12 } });
  });
  it('obyekt noma’lum bo‘lsa o‘qishdan oldin «qaysi obyekt?» so‘raladi', () => {
    expect(niyatAniqla('narxsiz qatorlar', ctx()).tur).toBe('obyektTanla');
  });
  it('fakt yozuvi: «+5 beton» -> yozuv (taklif kartasi), obyektsiz — obyekt so‘raladi', () => {
    expect(niyatAniqla('beton +5 kirit', ctx(joriy))).toMatchObject({ tur: 'yozuv' });
    expect(niyatAniqla('beton +5 kirit', ctx()).tur).toBe('obyektTanla');
  });
  it('yozuv niyati hech qachon navigatsiya/o‘qish bo‘lib ketmaydi (tasdiqsiz yozilmaydi)', () => {
    for (const m of ['=40 beton', 'devorga 12 qo‘sh']) expect(['yozuv', 'obyektTanla']).toContain(niyatAniqla(m, ctx(joriy)).tur);
  });
});

describe('hech qachon rad etmaydi', () => {
  it('noma’lum buyruq -> eng yaqin sahifalar (kamida bitta)', () => {
    const n = niyatAniqla('menga kofe olib kel', ctx());
    expect(n.tur).toBe('nomalum');
    if (n.tur === 'nomalum') expect(n.yaqin.length).toBeGreaterThan(0);
  });
  it('qisman mos: «narx» -> narx sahifalari taklif qilinadi', () => {
    const n = niyatAniqla('narx haqida gaplashamiz', ctx());
    if (n.tur === 'nomalum') expect(n.yaqin.some((s) => s.yol.includes('narx'))).toBe(true);
    else expect(['navigatsiya', 'sahifaTanla']).toContain(n.tur);
  });
});

describe('REESTR QOPLAMI — har sahifa uchun ochish niyati bor (yangi sahifa qo‘shilsa shu test yiqiladi)', () => {
  it('reestrning har bir sahifasi o‘z nomi bilan topiladi', () => {
    const yiqilgan: string[] = [];
    for (const s of NAV_SAHIFALAR) {
      const n = niyatAniqla(`${s.nom} sahifasini och`, ctx({ obyektlar: [] }));
      if (n.tur !== 'navigatsiya' || n.sahifa.yol !== s.yol) yiqilgan.push(`${s.yol} -> ${n.tur}${n.tur === 'navigatsiya' ? ':' + n.sahifa.yol : ''}`);
    }
    expect(yiqilgan).toEqual([]);
  });
  it('sinonim.ts da har sahifa uchun ru va en iboralar bor (docs/architecture/AI_YORDAMCHI.md qoidasi)', () => {
    const yoq = NAV_SAHIFALAR.filter((s) => !(SAHIFA_SINONIM[s.yol]?.ru.length && SAHIFA_SINONIM[s.yol]?.en.length)).map((s) => s.yol);
    expect(yoq).toEqual([]);
  });
  it('sinonim.ts da reestrda yo‘q (eskirgan) yo‘l yo‘q', () => {
    const yollar = new Set(NAV_SAHIFALAR.map((s) => s.yol));
    expect(Object.keys(SAHIFA_SINONIM).filter((y) => !yollar.has(y))).toEqual([]);
  });
  it('har sahifa o‘z sinonimlaridan birortasi bilan ham topiladi', () => {
    const yiqilgan: string[] = [];
    for (const s of NAV_SAHIFALAR) {
      for (const ibora of [...(SAHIFA_SINONIM[s.yol]?.ru ?? [])[0] ? [SAHIFA_SINONIM[s.yol].ru[0]] : [], SAHIFA_SINONIM[s.yol]?.en[0] ?? '']) {
        if (!ibora) continue;
        const r = sahifaTopish(sozlar(ibora), HAMMA);
        const topildi = r?.tur === 'aniq' ? r.sahifa.yol === s.yol : r?.tur === 'noaniq' && r.nomzodlar.some((x) => x.yol === s.yol);
        if (!topildi) yiqilgan.push(`${s.yol} «${ibora}»`);
      }
    }
    expect(yiqilgan).toEqual([]);
  });
});
