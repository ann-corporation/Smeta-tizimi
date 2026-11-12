import { describe, expect, it } from 'vitest';
import { koefBirlikdan, koefTarixdan, koefTaklif, kelishuvHisob, ustaBirlikNorm } from './kelishuv';
import { kelishuvMatni, narxOqi } from './jarvis';
import { satrTahlil, qatorKatBirlik, naryadJami, type NaryadQator } from './index';
import type { T2Qator } from '../../api/supabase';
import type { SmetaQator } from '../ish-kartasi';

/** Rigel: smeta m3 da, 1 m rigel 20x40 = 0,08 m3. Smeta mehnati 3 000 000 so'm / m3 → adolatli 240 000 so'm / m. */
const KIR = { smetaBirlik: 'м3', ustaBirlik: 'м', koef: 0.08, smetaPulBirlik: 3_000_000 };

describe('kelishuvHisob — oltin o‘rtalik', () => {
  it('usta metrda 250 000 aytadi: smeta birligiga 3 125 000; adolatli 240 000; sig‘maydi', () => {
    const k = kelishuvHisob({ ...KIR, taklif: 250_000, ustaHajm: 100 });
    expect(k.taklifSmetaBirlikda).toBe(3_125_000);
    expect(k.adolatli).toBe(240_000);
    expect(k.sigadi).toBe(false);
    expect(k.farqFoiz).toBeCloseTo(4.17, 1);
    expect(k.tavsiya).toBe(245_000);                     // tarix yo'q: o'rtasi
    expect(k.foydaTaklif).toBe(-10_000); expect(k.foydaTaklifJami).toBe(-1_000_000);
    expect(k.sabab).toContain('qimmat');
  });
  it('taklif smetaga sig‘adi — rozi bo‘lish; tarixda pol bo‘lsa va taklif undan past — pol tavsiya', () => {
    expect(kelishuvHisob({ ...KIR, taklif: 200_000 }).sabab).toContain('sig‘adi');
    expect(kelishuvHisob({ ...KIR, taklif: 200_000 }).tavsiya).toBe(200_000);
    const tarix = [{ usta_narx: 2_750_000, usta_narx_birlik: 220_000, koef: 0.08, usta_birlik: 'м' }];   // 2 750 000 × 0,08 = 220 000 / m
    const k = kelishuvHisob({ ...KIR, taklif: 180_000, tarix });
    expect(k.tarixPol).toBe(220_000); expect(k.tavsiya).toBe(220_000); expect(k.sabab).toContain('oldin');
    const q = kelishuvHisob({ ...KIR, taklif: 300_000, tarix });   // qimmat: tarix va smeta oralig'ida
    expect(q.tavsiya).toBe(240_000);                            // max(S=240000, T=220000), min(taklif)
  });
  it('NULL ≠ 0: taklif yo‘q → adolatli narx; smeta puli yo‘q → o‘ylab topmaydi; koef yo‘q → so‘raydi', () => {
    expect(kelishuvHisob({ ...KIR, taklif: null }).tavsiya).toBe(240_000);
    const s = kelishuvHisob({ ...KIR, taklif: 100_000, smetaPulBirlik: null });
    expect(s.adolatli).toBeNull(); expect(s.tavsiya).toBeNull(); expect(s.sigadi).toBeNull(); expect(s.foydaTaklif).toBeNull();
    const k = kelishuvHisob({ ...KIR, koef: null, taklif: 250_000 });
    expect(k.taklifSmetaBirlikda).toBeNull(); expect(k.adolatli).toBeNull(); expect(k.sabab).toContain('Koef');
  });
  it('ustamali adolatli narx hisob-yadro funksiyasi orqali (chaqiruvchi beradi)', () => {
    const k = kelishuvHisob({ ...KIR, taklif: 250_000, ustamali: (s) => s * 1.5 });
    expect(k.adolatliUstamali).toBe(360_000);
  });
});

describe('koef avtomatik', () => {
  it('birlikdan, tarixdan, usta birligi normallashadi', () => {
    expect(koefBirlikdan('kvadrat', '100М2')).toBeCloseTo(0.01);
    expect(koefBirlikdan('metr', 'м3')).toBeNull();
    expect(ustaBirlikNorm('Metr')).toBe('м'); expect(ustaBirlikNorm('dona')).toBe('шт'); expect(ustaBirlikNorm('pachka')).toBe('pachka');
    const tarix = [{ usta_narx: 1, usta_narx_birlik: 1, koef: 0.08, usta_birlik: 'м' }];
    expect(koefTarixdan(tarix, 'metr')).toBe(0.08); expect(koefTarixdan(tarix, 'dona')).toBeNull();
    const t = koefTaklif({ id: 1, birlik: 'м3' }, 'metr', [], tarix);
    expect(t).toEqual({ koef: 0.08, manba: 'tarix' });
    expect(koefTaklif({ id: 1, birlik: 'м3' }, 'metr', [], [])).toBeNull();
    expect(koefTaklif({ id: 1, birlik: '100М2' }, 'kvadrat', [], [])?.manba).toBe('birlik');
  });
  it('ish kartasi geometriyasidan (rigel 20×40)', () => {
    const karta = { holat: 'faol' as const, tur: 'rigel' as const, birlik: 'м' as const, parametrlar: { b_mm: 200, h_mm: 400 },
      bog: [{ qator_id: 1, obyekt_id: 1, rol: 'asosiy' as const, koef: 0.08, koef_usul: 'parametr' as const, bosqich: null, material_guruh: null }] };
    const t = koefTaklif({ id: 1, birlik: 'м3' }, 'metr', [karta], []);
    expect(t?.manba).toBe('karta'); expect(t?.koef).toBeCloseTo(0.08, 6);
  });
});

const qator = (o: Partial<NaryadQator> = {}): NaryadQator => ({
  id: 1, qator_id: 10, tartib: 1, kod: 'К1', nom: 'Устройство ригелей', birlik: 'м3', hajm: 8, norma_chel_soat: null, smeta_mehnat_birlik: 3_000_000, usta_narx: 3_125_000,
  kat: 'ЧЕЛ', usta_birlik: 'м', koef: 0.08, usta_narx_birlik: 250_000, smeta_kat_birlik: null, bajarilgan_hajm: null, qabul_hajm: null, fakt_boshida: 0, fakt_delta: null, fakt_yozilgan: null, ...o,
});

describe('satr: usta birligida to‘lov, МАТ/МАШ solishtirish', () => {
  it('to‘lov = hajm / koef × narx(usta birligi); smeta bilan farq', () => {
    const s = satrTahlil(qator(), 'reja');            // 8 m3 = 100 m × 250 000
    expect(s.summa).toBe(25_000_000); expect(s.smetaMehnat).toBe(24_000_000); expect(s.foyda).toBe(-1_000_000);
  });
  it('МАТ satri smeta МАТ puli bilan solishtiriladi (mehnat bilan emas); ЧЕЛ soat faqat ЧЕЛ', () => {
    const m = qator({ kat: 'МАТ', smeta_kat_birlik: 500_000, norma_chel_soat: 10, usta_birlik: null, koef: null, usta_narx_birlik: null, usta_narx: 400_000 });
    const s = satrTahlil(m, 'reja');
    expect(s.smetaMehnat).toBe(4_000_000); expect(s.summa).toBe(3_200_000); expect(s.foyda).toBe(800_000); expect(s.chelSoat).toBeNull();
    expect(naryadJami([qator(), m], 'reja').narxsizSoni).toBe(0);
  });
  it('narx noma‘lum — narxsiz (0 emas)', () => {
    const s = satrTahlil(qator({ usta_narx: null, usta_narx_birlik: null }), 'reja');
    expect(s.summa).toBeNull(); expect(s.narxsiz).toBe(true);
  });
  it('smeta qatoridan toifa puli: resursi yo‘q — null', () => {
    const q: SmetaQator = { id: 5, obyekt_id: 1, tur: 'bl', kod: 'E', nom: 'Ish', birlik: 'м3', hajm: 2, summa: 1500, bolalar: [
      { kat: 'ЧЕЛ', nom: 'Р', birlik: 'чел-ч', hajm: 20, summa: 1000 }, { kat: 'МАТ', nom: 'Б', birlik: 'м3', hajm: 1, summa: 500 }] };
    expect(qatorKatBirlik(q, 'ЧЕЛ')).toBe(500); expect(qatorKatBirlik(q, 'МАТ')).toBe(250); expect(qatorKatBirlik(q, 'МАШ')).toBeNull();
  });
});

describe('Jarvis: «rigelni metriga 250 mingdan quysa smetaga sig‘adimi?»', () => {
  const rows = [
    { id: 1, obyekt_id: 1, ota_id: null, tur: 'bl', kod: 'Е6-1', nom: 'УСТРОЙСТВО РИГЕЛЕЙ', birlik: 'м3', hajm: 10, summa: null, kat: null },
    { id: 2, obyekt_id: 1, ota_id: 1, tur: 'rs', kod: null, nom: 'ЗАТРАТЫ ТРУДА', birlik: 'чел-ч', hajm: 100, summa: 30_000_000, kat: 'ЧЕЛ' },
  ] as unknown as T2Qator[];
  it('narx va kesimdan hisoblaydi; sig‘maydi', () => {
    expect(narxOqi('250 ming')).toBe(250_000); expect(narxOqi('1,2 mln')).toBe(1_200_000); expect(narxOqi('250000')).toBe(250_000);
    const s = kelishuvMatni(rows, 'rigel; metr; 250 ming; 20x40');
    expect(s).toContain('0.08'); expect(s).toContain('3 125 000'); expect(s).toContain('240 000'); expect(s).toContain('SMETAGA SIG‘MAYDI');
  });
  it('koef noma‘lum — o‘ylab topmaydi; format xatosi; topilmadi', () => {
    expect(kelishuvMatni(rows, 'rigel; metr; 250 ming')).toContain('Koef noma’lum');
    expect(kelishuvMatni(rows, 'rigel')).toContain('Format');
    expect(kelishuvMatni(rows, 'xyz; metr; 100')).toContain('topilmadi');
  });
});
