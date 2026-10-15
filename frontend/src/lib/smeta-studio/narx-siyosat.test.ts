import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { KatalogQatori } from '../narx-katalog/types';
import { matchResource, type MatchCatalog, type MatchResult } from './resource-match';
import { narxAsosi, narxNomzodlari, ustunNomzod } from './narx-yigish';
import { kompaniyaManbaKatalogi, qqsHolatiniAniqla } from './kompaniya-manbalari';
import { ishKoeffitsientlari, jadvalKalitlari, koefgaAylantir, type KoefKatalog } from './koef-katalog';
import { applyCommand } from './commands';
import { emptyDoc } from './model';
import { docxMatni } from '../narx-dalil/docx-matn';
import { kpJavobiniTekshir, koefTanlovlariniTekshir } from '../smeta-ai/protokol';
import { smetaXulosasi } from './ai-kontekst';

const q = (id: number, nom: string, narx: number, o: Partial<KatalogQatori> = {}): KatalogQatori => ({ id, manba_id: 1, kod: null, nom, birlik: 'м3', narx, hudud: null,
  ishlab_chiqaruvchi: null, nds_holati: 'nds_siz', nds_izoh: null, yil: 2026, kvartal: 1, narx_varianti: null, guruh: null, hudud_kalit: null, manba_nom: 'Каталог цен РУз, 1 кв. 2026 г.',
  manba_tur: 'katalog', manba_sana: '2026-04-01', ...o });
const view = (rows: KatalogQatori[]): MatchCatalog => ({ size: rows.length, name: i => rows[i].nom, unit: i => rows[i].birlik, region: i => rows[i].hudud_kalit, price: i => rows[i].narx, row: i => rows[i] });

describe('narx siyosati (egasi 2026-10-15): hudud → yangi nashr → eng qimmat; kompaniya smetasi — oxirgi chora', () => {
  it('bir mahsulotdan: obyekt hududi, keyin respublika (birja), keyin yangi nashr, keyin eng qimmat', () => {
    const toshkent = q(1, 'Бетон В15', 800000, { hudud_kalit: 'toshkent_sh' }), birja = q(2, 'Бетон В15', 900000, { manba_tur: 'birja' });
    const samarqand = q(3, 'Бетон В15', 950000, { hudud_kalit: 'samarqand' });
    expect(ustunNomzod(birja, toshkent, 'toshkent_sh')).toBe(toshkent);
    expect(ustunNomzod(samarqand, birja, 'toshkent_sh')).toBe(birja);
    expect(ustunNomzod(q(4, 'X', 1, { yil: 2025, kvartal: 4 }), q(5, 'X', 1), null).id).toBe(5);
    expect(ustunNomzod(q(6, 'X', 100), q(7, 'X', 120), null).id).toBe(7);
  });
  it('katalog nomzodi bo‘lsa kompaniya smetasi taklif qilinmaydi; bo‘lmasa — "obosnovaniya emas" belgisi bilan oxirida', () => {
    const cat = view([q(1, 'Песок для строительных работ природный', 70000)]);
    const komp: MatchResult = { confidence: 'REVIEW', best: null, gateRejected: 0, candidateTotal: 1,
      candidates: [{ index: 0, row: q(9, 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ', 60000, { manba_nom: 'Smeta A' }), score: 1, regional: false, reasons: [], extraSpecs: 0 }] };
    const g = { nom: 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ', birlik: 'м3' };
    expect(narxNomzodlari(g, cat, komp, null).map(n => n.tur)).toEqual(['katalog']);
    const bosh = narxNomzodlari(g, view([]), komp, null);
    expect(bosh.map(n => n.tur)).toEqual(['kompaniya']);
    expect(bosh[0].manba).toContain('obosnovaniya emas');
    expect(narxAsosi(bosh[0]).docType).toBe('COMPANY_ESTIMATE');
  });
  it('obosnovaniya hujjat turi: birja → EXCHANGE, prays → PRICE_LIST, KP → COMMERCIAL_OFFER; QQS izohi hujjat satrida', () => {
    const [b] = narxNomzodlari({ nom: 'Портландцемент ПЦ 400', birlik: 'т' }, view([q(1, 'Портландцемент ПЦ 400 (в мешках)', 1000000, { birlik: 'тн', manba_tur: 'birja', manba_nom: 'Котировки УзРТСБ, март 2025 г.', nds_izoh: 'kotirovka 1120000 (с НДС) ÷ 1,12' })]), null, null);
    expect(narxAsosi(b)).toMatchObject({ docType: 'EXCHANGE', document: expect.stringContaining('Котировки УзРТСБ, март 2025 г.') });
    expect(narxAsosi(b).document).toContain('÷ 1,12');
    const kpm = kompaniyaManbaKatalogi([{ id: 3, tur: 'kp', nom: 'КП', raqam: '15', sana: '2026-09-20', yetkazuvchi: 'ООО Цемент', region: null, yil: 2026, kvartal: 3, nds_holati: 'nds_bilan' }],
      [{ id: 11, manba_id: 3, nom: 'Портландцемент ПЦ 400', birlik: 'т', narx: 1344000 }]);
    const kp = narxNomzodlari({ nom: 'Портландцемент ПЦ 400', birlik: 'т' }, view([]), null, null, [], 12, matchResource(kpm.view, 'Портландцемент ПЦ 400', 'т', null));
    expect(kp[0]).toMatchObject({ tur: 'kp', narx: 1200000 });
    expect(narxAsosi(kp[0])).toMatchObject({ docType: 'COMMERCIAL_OFFER', document: expect.stringContaining('Коммерческое предложение № 15 от 20.09.2026 ООО Цемент') });
  });
  it('kompaniya manbasi: QQS noma‘lum bo‘lsa ishlatilmaydi; QQS holati hujjat so‘zlaridan', () => {
    const k = kompaniyaManbaKatalogi([{ id: 1, tur: 'kp', nom: 'КП', raqam: null, sana: null, yetkazuvchi: null, region: null, yil: null, kvartal: null, nds_holati: 'nomalum' }],
      [{ id: 1, manba_id: 1, nom: 'Кирпич', birlik: 'шт', narx: 1500 }]);
    expect(k).toMatchObject({ qatorlar: 0, qqsNomalum: 1 });
    expect(qqsHolatiniAniqla('Цены указаны с учетом НДС 12%')).toBe('nds_bilan');
    expect(qqsHolatiniAniqla('Цена без НДС')).toBe('nds_siz');
    expect(qqsHolatiniAniqla('Прайс-лист')).toBe('nomalum');
  });
});

describe('normativ koeffitsientlar', () => {
  const kat: KoefKatalog = { schema: 'koef-katalog-v1', manba: 'test', jadval: { '1-1-3': ['П-1037-А'], '1-1-3-2': ['П-1046'], '46-2-1': ['П-46'] },
    koef: { 'П-1037-А': { a: 'ТЧ п.3.37', t: 'ТЧ п.3.37 Кзтр=1,2, Кэм=1,2', s: 'в котлованах объёмом до 300 м3', q: '', k: { 'ЧЕЛ': 1.2, 'МАШ': 1.2 } },
      'П-1046': { a: 'ТЧ п.3.46', t: 'ТЧ п.3.46', s: 'мокрый грунт', q: '', k: { 'ЧЕЛ': 1.15, 'МАШ': 1.25 } },
      'П-46': { a: 'ТЧ п.1.4', t: 'разборка', s: 'разборка конструкций', q: '', k: { 'ЧЕЛ': 0.8, 'МАШ': 0.8, 'МАТ': 0 } } } };
  it('ish shifri → jadval va qator kalitlari; jadval ∪ qator koeffitsientlari', () => {
    expect(jadvalKalitlari('E1-1-3-2')).toEqual(['1-1-3', '1-1-3-2']);
    expect(jadvalKalitlari('Е01-01-003-02')).toEqual(['1-1-3', '1-1-3-2']);
    expect(ishKoeffitsientlari(kat, 'E1-1-3-2').map(n => n.kod)).toEqual(['П-1037-А', 'П-1046']);
    expect(ishKoeffitsientlari(kat, 'E9-9-9-9')).toEqual([]);
  });
  it('Кзтр=Кэм → bitta ЧЕЛ+МАШ; turlicha → alohida; Кмр=0 → МАТ × 0; hammasi qabul qilinmaguncha taklif', () => {
    expect(koefgaAylantir({ kod: 'П-1037-А', yozuv: kat.koef['П-1037-А'] }).map(c => [c.scope, c.value, c.origin, c.accepted])).toEqual([['ЧЕЛ+МАШ', '1.2', 'NORM', false]]);
    expect(koefgaAylantir({ kod: 'П-1046', yozuv: kat.koef['П-1046'] }).map(c => [c.scope, c.value])).toEqual([['ЧЕЛ', '1.15'], ['МАШ', '1.25']]);
    const dem = koefgaAylantir({ kod: 'П-46', yozuv: kat.koef['П-46'] }, true);
    expect(dem.map(c => [c.scope, c.value])).toEqual([['ЧЕЛ+МАШ', '0.8'], ['МАТ', '0']]);
    // The command layer accepts a normative Кмр = 0, but never an operator zero.
    const doc = applyCommand(applyCommand(emptyDoc('d'), { type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'A' }),
      { type: 'ADD_OCCURRENCE', occurrenceId: 'o', sectionId: 's', source: { catalogRevision: 'r', workId: 'w', code: 'E46-2-1-1', name: 'РАЗБОРКА', unitCode: null, tableLabel: null }, recipe: [], quantity: '1', basis: { scale: '1', unitLabel: 'м3', evidence: '1 м3', origin: 'OPERATOR' } });
    expect(applyCommand(doc, { type: 'SET_COEFFICIENTS', occurrenceId: 'o', coefficients: dem }).occurrences.o.coefficients).toHaveLength(2);
    expect(() => applyCommand(doc, { type: 'SET_COEFFICIENTS', occurrenceId: 'o', coefficients: [{ ...dem[1], origin: 'OPERATOR' }] })).toThrow('COEFFICIENT_INVALID');
    expect(smetaXulosasi(applyCommand(doc, { type: 'SET_COEFFICIENTS', occurrenceId: 'o', coefficients: dem }))).toContain('E46-2-1-1 РАЗБОРКА | hajm: 1 м3');
  });
  it('AI koeffitsient tanlovi: faqat yuborilgan ro‘yxatdagi kodlar qoladi', () => {
    const r = koefTanlovlariniTekshir({ tanlovlar: [{ ish: 'o', kodlar: ['П-1037-А', 'П-999'], sabab: 'kotlovan 250 m3' }, { ish: 'x', kodlar: ['П-1037-А'], sabab: '' }], savol: null },
      [{ id: 'o', ish: 'E1-1-3-2', nomzodlar: [{ kod: 'П-1037-А', shart: '...' }] }]);
    expect(r.tanlovlar).toEqual([{ ish: 'o', kodlar: ['П-1037-А'], sabab: 'kotlovan 250 m3' }]);
  });
});

describe('KP o‘qish', () => {
  it('Word (.docx) jadvali matnga: kataklar " | " bilan', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>КП № 15 от 20.09.2026, цены с НДС</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Цемент М400</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>т</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1 344 000</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
    const docx = zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types/>') });
    const m = docxMatni(docx);
    expect(m).toContain('КП № 15 от 20.09.2026, цены с НДС');
    expect(m).toContain('Цемент М400 | т | 1 344 000');
  });
  it('model javobi tekshiriladi: narxsiz/manfiy narx null, sana formati, QQS holati', () => {
    expect(kpJavobiniTekshir({ yetkazuvchi: ' ООО А ', inn: '301 234 567', sana: '20.09.2026', nds_holati: 'x', qatorlar: [{ nom: 'Цемент', birlik: 'т', narx: 1344000 }, { nom: 'Песок', birlik: 'м3', narx: -5 }, { nom: '', narx: 1 }] }))
      .toEqual({ yetkazuvchi: 'ООО А', inn: '301234567', raqam: null, sana: null, nds_holati: 'nomalum', nds_dalil: null,
        qatorlar: [{ nom: 'Цемент', birlik: 'т', narx: 1344000 }, { nom: 'Песок', birlik: 'м3', narx: null }] });
  });
});
