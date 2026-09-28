import { describe, expect, it } from 'vitest';
import { m29Hisobla, type M29SmetaQator, type M29F2Qator, type M29SkladQator } from './index';
import { m29Hujjat } from './export';
import { hujjatTekshir } from '../hujjat-yozuvchi';

// Smeta: bitta ish (beton quyish 100 m3 birlik) — beton normasi 101.5, suv 0.2;
// ikkinchi ish — armatura (resurs F2 da O'ZI yozilgan), ЧЕЛ M-29 ga kirmaydi.
const S: M29SmetaQator[] = [
  { id: 1, ota_id: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ 1', birlik: null, hajm: null, narx: null, kat: null },
  { id: 2, ota_id: 1, tur: 'bl', kod: 'Е6-1-1', nom: 'УСТРОЙСТВО ФУНДАМЕНТОВ', birlik: '100 М3', hajm: 2, narx: null, kat: null },
  { id: 3, ota_id: 2, tur: 'mat', kod: '12-575', nom: 'БЕТОН В15 /М-200/', birlik: 'М3', hajm: 203, narx: 800_000, norma: 101.5, kat: 'МАТ' },
  { id: 4, ota_id: 2, tur: 'mat', kod: '009219', nom: 'ВОДА', birlik: 'М3', hajm: 0.4, narx: 5_000, norma: 0.2, kat: 'МАТ' },
  { id: 5, ota_id: 2, tur: 'rs', kod: '1-100', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 360, narx: 20_000, norma: 180, kat: 'ЧЕЛ' },
  { id: 6, ota_id: 1, tur: 'bl', kod: 'Е6-2-1', nom: 'АРМИРОВАНИЕ', birlik: 'Т', hajm: 10, narx: null, kat: null },
  { id: 7, ota_id: 6, tur: 'mat', kod: '204-1', nom: 'АРМАТУРА А500', birlik: 'Т', hajm: 10.2, narx: 9_000_000, norma: 1.02, kat: 'МАТ' },
  { id: 8, ota_id: 6, tur: 'mat', kod: '101-9', nom: 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', birlik: 'КГ', hajm: 50, narx: 20_000, norma: 5, kat: 'МАТ' },
];
const F2: M29F2Qator[] = [
  // Avgust: fundament 0.5 (100 m3) — faqat ish hajmi; beton = 101.5 × 0.5 = 50.75
  { qator_id: 2, oy: '2026-08-01', hajm: 0.5, akt_holat: 'tasdiqlangan' },
  // Sentabr: fundament 0.3 → beton 30.45; armatura resursi o'zi F2 da 3.06 t
  { qator_id: 2, oy: '2026-09-01', hajm: 0.3, akt_holat: 'tasdiqlangan' },
  { qator_id: 7, oy: '2026-09-01', hajm: 3.06, akt_holat: 'tasdiqlangan' },
  { qator_id: 6, oy: '2026-09-01', hajm: 3, akt_holat: 'tasdiqlangan' },
  // Qoralama hisobga olinmaydi; kelajak oy ham.
  { qator_id: 2, oy: '2026-09-01', hajm: 99, akt_holat: 'qoralama' },
  { qator_id: 2, oy: '2026-10-01', hajm: 1, akt_holat: 'tasdiqlangan' },
];
const SK: M29SkladQator[] = [
  { operatsiya: 'prixod', sana: '2026-08-10', nomi: 'Бетон В15 /м-200/', birligi: 'м3', obyomi: 100 },
  { operatsiya: 'rasxod', sana: '2026-08-20', nomi: 'БЕТОН В15 /М-200/', birligi: 'М3', obyomi: 52 },
  { operatsiya: 'rasxod', sana: '2026-09-15', nomi: 'БЕТОН В15 /М-200/', birligi: 'М3', obyomi: 31 },
  { operatsiya: 'prixod', sana: '2026-09-01', nomi: 'АРМАТУРА А500', birligi: 'Т', obyomi: 5 },
  { operatsiya: 'rasxod', sana: '2026-09-10', nomi: 'АРМАТУРА А500', birligi: 'Т', obyomi: 3.0 },
  // Smetada yo'q material skladdan chiqarilgan — "qayerga ishlatildi?"
  { operatsiya: 'rasxod', sana: '2026-09-11', nomi: 'КРАСКА ФАСАДНАЯ', birligi: 'КГ', obyomi: 40 },
  // Sim: F2 da ish bor, lekin normaga ko'ra 15 kg; skladdan 40 kg — перерасход
  { operatsiya: 'rasxod', sana: '2026-09-12', nomi: 'Проволока вязальная', birligi: 'кг', obyomi: 40 },
];

describe('M-29 — norma bo\'yicha va haqiqiy sarf', () => {
  const n = m29Hisobla({ smeta: S, f2: F2, sklad: SK }, '2026-09');
  const mat = (nom: string) => n.guruhlar.flatMap((g) => g.materiallar).find((m) => m.nom === nom)!;

  it('ish hajmi × norma: oy va boshidan (qoralama va keyingi oy kirmaydi)', () => {
    const b = mat('БЕТОН В15 /М-200/');
    expect(b.normaOy).toBeCloseTo(30.45, 6);
    expect(b.normaJami).toBeCloseTo(81.2, 6);
    expect(b.faktOy).toBe(31);
    expect(b.faktJami).toBe(83);
    expect(b.farqJami).toBeCloseTo(1.8, 6); // перерасход
    expect(b.farqSummaJami).toBeCloseTo(1.8 * 800_000, 2);
    expect(b.kirimJami).toBe(100);
    expect(b.skladQoldiq).toBe(17);
  });

  it('resurs F2 da o\'zi yozilgan — o\'sha miqdor normativ sarf (ikki marta hisoblanmaydi)', () => {
    const a = mat('АРМАТУРА А500');
    expect(a.normaJami).toBeCloseTo(3.06, 6);
    expect(a.ishlar).toHaveLength(1);
    expect(a.ishlar[0].toGridan).toBe(true);
    expect(a.farqJami).toBeCloseTo(-0.06, 6); // экономия
  });

  it('ЧЕЛ/МАШ M-29 ga kirmaydi; skladda umuman yo\'q material — fakt NOMA\'LUM (nol emas)', () => {
    expect(n.guruhlar.flatMap((g) => g.materiallar).some((m) => m.nom === 'ЗАТРАТЫ ТРУДА')).toBe(false);
    const v = mat('ВОДА');
    expect(v.normaJami).toBeCloseTo(0.16, 6);
    expect(v.faktJami).toBeNull();
    expect(v.farqJami).toBeNull();
    expect(n.diqqat.some((d) => d.tur === 'SKLAD_KIRITILMAGAN' && d.nom.startsWith('ВОДА'))).toBe(true);
  });

  it('"qayerga ishlatildi?": smetada yo\'q material va normadan ortiq chiqim diqqatda, pul ta\'siri bilan', () => {
    expect(n.smetadaYoq.map((s) => s.nomi)).toContain('КРАСКА ФАСАДНАЯ');
    expect(n.diqqat.find((d) => d.tur === 'SMETADA_YOQ')?.sabab).toMatch(/где использован/);
    const sim = n.diqqat.find((d) => d.tur === 'PERERASXOD' && d.nom.startsWith('ПРОВОЛОКА'));
    expect(sim?.summa).toBeCloseTo((40 - 15) * 20_000, 2);
    expect(n.jami.ortiqchaSumma).toBeGreaterThan(n.jami.tejashSumma);
  });

  it('hujjat: rasmiy shakl, formulalar $ siz, keshli, imzolar, ierarxiya jamilari', () => {
    const h = m29Hujjat(n, { obyektNom: 'Сунъий кўл', pudratchi: 'New Times Buildings' });
    const r = hujjatTekshir(h.bytes, { ruxsat: [/Сунъий кўл/, /New Times/] });
    expect(r.dollarFormulalar).toEqual([]);
    expect(r.keshsizFormulalar).toEqual([]);
    expect(r.taqiqlangan).toEqual([]);
    const matn = r.matnlar.join(' | ');
    expect(matn).toContain('ФОРМА № М-29');
    expect(matn).toContain('ИТОГО ПО ГРУППЕ «МАТЕРИАЛЫ»');
    expect(matn).toContain('КРАСКА ФАСАДНАЯ');
    expect(matn).toContain('ПОДРЯДЧИК');
    expect(h.faylNomi).toMatch(/М-29_2026-09\.xlsx$/);
  });
});
