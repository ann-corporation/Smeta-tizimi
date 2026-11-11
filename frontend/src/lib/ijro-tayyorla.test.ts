import { describe, expect, it } from 'vitest';
import type { AosrCoverage } from '../api/t2-aosr';
import type { ObyektImzochi } from '../api/obyekt-imzochi';
import {
  aosrTartibMeta, aosrTartibla, komissiyaImzochilardan, qoralamaGuruhdan, raqamTekshiruv, razdelXaritasi, sanaOraligi,
  yetishmayotganlar, type QatorMeta,
} from './ijro-tayyorla';
import { aosrReestrXlsx } from './ijro-reestr-export';
import { hujjatTekshir } from './hujjat-yozuvchi';

// Soxta ma'lumot: 2 razdel (tartib 2 va 1 — id tartibiga teskari), har birida ish va resurs.
const meta: QatorMeta[] = [
  { id: 10, ota_id: null, tartib: 2, tur: 'rz', nom: 'Razdel B' },
  { id: 20, ota_id: null, tartib: 1, tur: 'rz', nom: 'Razdel A' },
  { id: 11, ota_id: 10, tartib: 1, tur: 'bl', nom: 'Ish B1' },
  { id: 21, ota_id: 20, tartib: 1, tur: 'bl', nom: 'Ish A1' },
  { id: 22, ota_id: 20, tartib: 2, tur: 'bl', nom: 'Ish A2' },
  { id: 211, ota_id: 21, tartib: 1, tur: 'rs', nom: 'Material A1' },
  { id: 90, ota_id: null, tartib: 9, tur: 'bl', nom: 'Razdelsiz ish' },
];
const cov = (qator_id: number, o: Partial<AosrCoverage> = {}): AosrCoverage => ({
  qator_id, obyekt_id: 1, nom: `Qator ${qator_id}`, kod: `К${qator_id}`, birlik: 'м3', kat: 'bl', fakt_hajm: 5, yashirin: true, akt_bor: false, ...o,
});

describe('razdelXaritasi / yetishmayotganlar', () => {
  it('razdel tartibi smeta tartibi bo‘yicha, razdelsiz oxirida', () => {
    const r = razdelXaritasi(meta);
    expect(r.get(211)?.nom).toBe('Razdel A');
    expect(r.get(90)?.id).toBeNull();
    const g = yetishmayotganlar([cov(11), cov(21), cov(22), cov(90), cov(300)], meta);
    expect(g.map((x) => x.nom)).toEqual(['Razdel A', 'Razdel B', '']);
    expect(g[0].ishlar.map((c) => c.qator_id)).toEqual([21, 22]);
  });

  it('faqat aktsiz yashirin ishlar; aktli va yashirin emas sanalmaydi; resurs ishga ulanadi', () => {
    const g = yetishmayotganlar([cov(21), cov(22, { akt_bor: true }), cov(11, { yashirin: false }), cov(211, { kat: 'mat', yashirin: false })], meta);
    expect(g).toHaveLength(1);
    expect(g[0].ishlar.map((c) => c.qator_id)).toEqual([21]);
    expect(g[0].resurslar.map((r) => r.c.qator_id)).toEqual([211]);
  });

  it('hammasi qoplangan bo‘lsa bo‘sh', () => {
    expect(yetishmayotganlar([cov(21, { akt_bor: true })], meta)).toEqual([]);
  });
});

describe('qoralamaGuruhdan', () => {
  const g = yetishmayotganlar([cov(21, { nom: 'Ish A1' }), cov(22, { nom: 'Ish A2' }), cov(211, { kat: 'mat', yashirin: false, nom: 'Material A1' })], meta)[0];
  const sanalar = sanaOraligi([21, 22], [{ akt_id: 1, qator_id: 21 }, { akt_id: 2, qator_id: 22 }, { akt_id: 3, qator_id: 99 }],
    [{ id: 1, sana: '2026-03-10' }, { id: 2, sana: '2026-03-04T00:00:00Z' }, { id: 3, sana: '2025-01-01' }]);

  it('sana oralig‘i faqat berilgan qatorlardan', () => {
    expect(sanalar).toEqual({ boshlanish: '2026-03-04', tugash: '2026-03-10' });
    expect(sanaOraligi([5], [], [])).toEqual({ boshlanish: null, tugash: null });
  });

  it('holat doim qoralama; resurs materiallarga tushadi; bir nechta ish — razdel nomi', () => {
    const m = qoralamaGuruhdan(g, g.ishlar, { raqam: '7', sanalar });
    expect(m.holat).toBe('yangi');
    expect(m.tur).toBe('aosr');
    expect(m.raqam).toBe('7');
    expect(m.ish_nomi).toBe('Razdel A');
    expect(m.materiallar).toContain('Material A1');
    expect(m.ish_tavsifi).toContain('Ish A1');
    expect(m.ish_tavsifi).toContain('Ish A2');
    expect(m.boshlanish_sana).toBe('2026-03-04');
    expect(m.tugash_sana).toBe('2026-03-10');
  });

  it('bitta ish — ish nomi; sana noma‘lum bo‘lsa bo‘sh (o‘ylab topilmaydi)', () => {
    const m = qoralamaGuruhdan(g, [g.ishlar[0]], { raqam: '1' });
    expect(m.ish_nomi).toBe('Ish A1');
    expect(m.sana).toBeUndefined();
    expect(m.boshlanish_sana).toBeUndefined();
  });

  it('boshqa ishning resursi qo‘shilmaydi', () => {
    const m = qoralamaGuruhdan(g, [g.ishlar[1]], { raqam: '1' });
    expect(m.materiallar).toBe('');
  });
});

describe('komissiyaImzochilardan', () => {
  const y = (rol: ObyektImzochi['rol'], fio: string | null): ObyektImzochi => ({
    rol, qatlamlar: { loyiha: null, obyekt: null, razdel: null }, yozish: { loyiha: false, obyekt: false, razdel: false },
    effektiv: fio ? { daraja: 'obyekt', razdel_id: null, tashkilot: 'Fake MChJ', lavozim: 'Muhandis', fio, manba: 'kiritilgan', tomon_kompaniya_id: null, yangilangan_at: null } : null,
  });
  it('subpudratchisiz: pudratchi → smo, texnadzor, loyihachi; nom bo‘sh bo‘lsa qator bo‘sh qoladi', () => {
    const r = komissiyaImzochilardan([y('pudratchi', 'Test Bir'), y('texnadzor', 'Test Ikki'), y('zakazchik', 'Test Uch'), y('loyihachi', null)]);
    expect(r.blank).toBe('subpudratchisiz');
    expect(r.komissiya.map((k) => k.rol)).toEqual(['smo', 'texnadzor', 'loyihachi']);
    expect(r.komissiya[0].fio).toBe('Test Bir');
    expect(r.komissiya[2].fio).toBeUndefined();
  });
  it('subpudratchi bo‘lsa — subpudratchili blank, pudratchi bosh pudratchi bo‘ladi', () => {
    const r = komissiyaImzochilardan([y('pudratchi', 'Test Bir'), y('subpudratchi', 'Test Sub')]);
    expect(r.blank).toBe('subpudratchili');
    expect(r.komissiya.map((k) => k.rol).slice(0, 2)).toEqual(['subpudratchi', 'bosh_pudratchi']);
  });
});

describe('reestr tartibi', () => {
  const akt = (id: number, raqam: string | null, sana: string | null, bosh: string | null = null) => ({
    id, raqam, sana, boshlanish_sana: bosh, ish_nomi: `Akt ${id}`, holat: 'yangi' as const, tur: 'aosr' as const, protokol_soni: 0,
  });
  const rz = razdelXaritasi(meta);
  const aktlar = [akt(1, '1', '2026-05-01'), akt(2, '2', '2026-02-01'), akt(3, '3', '2026-03-01'), akt(4, '4', null)];
  const bog = new Map<number, number[]>([[1, [11]], [2, [21]], [3, [22]], [4, []]]);
  const tm = new Map(aktlar.map((a) => [a.id, aosrTartibMeta(a, bog.get(a.id) ?? [], rz)]));

  it('razdel tartibi → sana; razdelsiz oxirida', () => {
    expect(aosrTartibla(aktlar, tm).map((a) => a.id)).toEqual([2, 3, 1, 4]);
  });

  it('raqam bo‘shliqlari va takrorlari', () => {
    expect(raqamTekshiruv([{ raqam: '1' }, { raqam: '3' }, { raqam: '3' }, { raqam: '6' }, { raqam: null }])).toEqual({ yoq: [2, 4, 5], takror: [3] });
    expect(raqamTekshiruv([])).toEqual({ yoq: [], takror: [] });
  });

  it('kengaytirilgan reestr yaroqli hujjat; lab ogohlantirishi va raqam bo‘shlig‘i yoziladi', () => {
    const tartib = new Map([...tm].map(([id, m]) => [id, { ...m, labYetishmaydi: id === 2 ? (['beton'] as const) : [] }]));
    const { bytes } = aosrReestrXlsx(aktlar as never, { obyektNomi: 'Test obyekt', sana: '2026-10-01', tartib });
    const t = hujjatTekshir(bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.matnlar.some((x) => x.includes('нет протокола лаборатории: бетон'))).toBe(true);
    expect(t.matnlar.some((x) => x.includes('RAZDEL A'))).toBe(true);
  });
});

describe('eski tizimdan ko‘chirilgan qoidalar', () => {
  it('yashirin ish kalit so‘zi, material dublikatsiz, sifat va dublikat', async () => {
    const q = await import('./ijro-qoida');
    expect(q.yashirinIshmi('Армирование монолитной плиты')).toBe(true);
    expect(q.yashirinIshmi('Окраска фасада')).toBe(false);
    expect(q.materialTokenlar('Бетон В25, W6; арматура А500\nБЕТОН В25, W6')).toEqual(['Бетон В25, W6', 'арматура А500']);
    expect(q.aktSifatMuammolari({ ish_nomi: 'Окраска', materiallar: '', boshlanish_sana: '2026-05-02', tugash_sana: '2026-05-01', komissiya: [{ fio: '' }] }))
      .toEqual(['yashirin_emas', 'material', 'sana_xato', 'imzochi']);
    expect(q.aktSifatMuammolari({ ish_nomi: 'Бетонирование', materiallar: 'Бетон', tugash_sana: '2026-05-01' })).toEqual([]);
    expect(q.aktDublikatlari([
      { id: 1, ish_nomi: 'Бетонирование плиты', holat: 'yangi' }, { id: 2, ish_nomi: 'бетонирование  плиты', holat: 'yangi' },
      { id: 3, ish_nomi: 'Бетонирование плиты', holat: 'bekor' },
    ])).toEqual([2]);
  });
});
