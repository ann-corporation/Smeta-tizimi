import { describe, expect, it } from 'vitest';
import { savolTahlil } from './savol';

const B = '2026-11-18';
const s = (m: string) => savolTahlil(m, B);

describe('savolTahlil: hisobot', () => {
  it('«o\'tgan oy sement qancha keldi»', () => {
    expect(s('o\'tgan oy sement qancha keldi')).toMatchObject({ amal: 'hisobot', nomi: 'sement', operatsiya: 'prixod', kontragent: null, davr: { belgi: 'otgan_oy', dan: '2026-10-01', gacha: '2026-10-31' } });
  });
  it('«Alfa-snabdan nima olganmiz» — yetkazuvchi bo\'yicha, davrsiz', () => {
    const r = s('Alfa-snabdan nima olganmiz');
    expect(r).toMatchObject({ amal: 'hisobot', operatsiya: 'prixod', davr: null });
    expect((r as { kontragent: string }).kontragent.toLowerCase()).toContain('alfa-snab');
  });
  it('ruscha: «за прошлый месяц сколько цемента пришло»', () => {
    expect(s('за прошлый месяц сколько цемента пришло')).toMatchObject({ amal: 'hisobot', operatsiya: 'prixod', davr: { belgi: 'otgan_oy' } });
  });
  it('chiqim: «bu hafta nima berdik», «что выдали вчера»', () => {
    expect(s('bu hafta nima berdik')).toMatchObject({ amal: 'hisobot', operatsiya: 'rasxod', davr: { belgi: 'hafta' } });
    expect(s('что выдали вчера')).toMatchObject({ amal: 'hisobot', operatsiya: 'rasxod', davr: { belgi: 'kecha' } });
  });
  it('«bugungi kirim-chiqim jadvali» — yo\'nalishsiz hisobot', () => {
    expect(s('bugungi kirim-chiqim jadvali')).toMatchObject({ amal: 'hisobot', operatsiya: null, davr: { belgi: 'bugun' } });
  });
  it('«sentabrda armatura qancha keldi» — oy nomi', () => {
    expect(s('sentabrda armatura qancha keldi')).toMatchObject({ amal: 'hisobot', nomi: 'armatura', davr: { dan: '2026-09-01', gacha: '2026-09-30' } });
  });
});

describe('savolTahlil: ostatka', () => {
  it('«bugungi qoldiq» — nomsiz, bugungi sana', () => {
    expect(s('bugungi qoldiq')).toMatchObject({ amal: 'qoldiq', nomi: null, davr: { belgi: 'bugun' } });
  });
  it('«kechagi ostatka», «ostatok цемента на 2026-11-05»', () => {
    expect(s('kechagi ostatka')).toMatchObject({ amal: 'qoldiq', davr: { belgi: 'kecha' } });
    expect(s('остаток цемента 2026-11-05')).toMatchObject({ amal: 'qoldiq', nomi: 'цемента', davr: { gacha: '2026-11-05' } });
  });
});

describe('savolTahlil: buyruq savol emas', () => {
  it('miqdor+birlik bor va savol so\'zi yo\'q -> null (eski buyruq tahlili)', () => {
    expect(s('sement 10 tonna keldi')).toBeNull();
    expect(s('bugun mix 20 kg Aliga berdim')).toBeNull();
    expect(s('50 kg mix keldi')).toBeNull();
    expect(s('')).toBeNull();
  });
  it('«sement qancha» (davr/yo\'nalish yo\'q) — eski ostatka mantig\'i (savol emas)', () => {
    expect(s('sement qancha')).toBeNull();
  });
});
