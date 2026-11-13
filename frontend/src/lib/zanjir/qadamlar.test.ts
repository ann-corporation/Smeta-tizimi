import { describe, expect, it } from 'vitest';
import { ZANJIR_TARTIB, zanjirDaraxtdan, zanjirHisobla, zanjirKirishYasa, zanjirRolKoradi, type ZanjirKirish } from './qadamlar';
import type { MarkazAkt } from '../pto-markazi/markaz';

/** Hamma narsa bajarilgan, to'lov yozilgan. */
const tayyor = (o: Partial<ZanjirKirish> = {}): ZanjirKirish => ({
  smeta: { bor: true, narxsiz: 0 }, faktSaqlangan: 3, faktQoralama: 0, aosr: { yashirin: 2, aktsiz: 0 },
  f2BuOyda: true, f2TasdiqBuOyda: 1, forma3: 1, tolovYozilgan: 1, slichitelniy: { farqli: 0, barglar: 5 }, oy: '2026-11', ...o,
});
const holatlar = (k: ZanjirKirish) => Object.fromEntries(zanjirHisobla(k).qadamlar.map((q) => [q.id, q.holat]));

describe('zanjirHisobla — tartib', () => {
  it('tartib: smeta, fakt, АОСР, F2, F3, to‘lov (АОСР F2 dan oldin)', () => {
    expect(ZANJIR_TARTIB).toEqual(['smeta', 'fakt', 'aosr', 'f2', 'nakopitelniy', 'f3', 'tolov', 'slichitelniy']);
    expect(zanjirHisobla(tayyor()).qadamlar.map((q) => q.id)).toEqual(['smeta', 'fakt', 'aosr', 'f2', 'nakopitelniy', 'f3', 'tolov', 'slichitelniy']);
    expect(ZANJIR_TARTIB.indexOf('aosr')).toBeLessThan(ZANJIR_TARTIB.indexOf('f2'));
  });
  it('hammasi bajarilgan — tavsiya yo‘q, tugallandi', () => {
    const n = zanjirHisobla(tayyor());
    expect(n.keyingi).toBeNull();
    expect(n.tugallandi).toBe(true);
    expect(n.qadamlar.every((q) => q.holat === 'done')).toBe(true);
  });
});

describe('zanjirHisobla — tavsiya mantig‘i', () => {
  it('smeta yo‘q — smetani yuklang; fakt/АОСР/F2 blocked', () => {
    const k = tayyor({ smeta: { bor: false, narxsiz: null }, faktSaqlangan: 0, faktQoralama: 0, f2BuOyda: false, f2TasdiqBuOyda: 0, forma3: null, aosr: null, tolovYozilgan: null });
    const n = zanjirHisobla(k);
    expect(n.keyingi).toMatchObject({ id: 'smeta', amal: 'Smetani yuklang', aniq: true });
    expect(holatlar(k)).toMatchObject({ smeta: 'current', fakt: 'blocked', aosr: 'blocked', f2: 'blocked', f3: 'blocked', tolov: 'blocked' });
  });
  it('narxsiz qatorlar bor — avval narxlash (fakt kirita oladi: not_started)', () => {
    const k = tayyor({ smeta: { bor: true, narxsiz: 4 }, faktSaqlangan: 0, f2BuOyda: false, f2TasdiqBuOyda: 0, forma3: 0, tolovYozilgan: 0 });
    expect(zanjirHisobla(k).keyingi).toMatchObject({ id: 'smeta', amal: 'Smetani narxlang', sabab: '4 qator narxsiz' });
    expect(holatlar(k).fakt).toBe('not_started');
  });
  it('smeta tayyor, fakt yo‘q — fakt kiriting', () => {
    const k = tayyor({ faktSaqlangan: 0, f2BuOyda: false, f2TasdiqBuOyda: 0, forma3: null, aosr: { yashirin: 0, aktsiz: 0 } });
    expect(zanjirHisobla(k).keyingi?.id).toBe('fakt');
  });
  it('fakt qoralamada — faktni yakunlang; keyingi qadamlar blocked', () => {
    const k = tayyor({ faktQoralama: 2, aosr: { yashirin: 2, aktsiz: 1 }, f2BuOyda: false, f2TasdiqBuOyda: 0, forma3: null });
    expect(zanjirHisobla(k).keyingi).toMatchObject({ id: 'fakt', amal: 'Faktni yakunlang' });
    expect(holatlar(k)).toMatchObject({ aosr: 'not_started', f2: 'not_started' }); // saqlangan fakt bor — qoralama obyekt darajasidagi qadamlarni to‘smaydi
  });
  it('fakt bor, АОСР siz yashirin ish bor — F2 dan OLDIN АОСР tavsiya; F2 not_started (blocked emas)', () => {
    const k = tayyor({ aosr: { yashirin: 3, aktsiz: 2 }, f2BuOyda: false, f2TasdiqBuOyda: 0, forma3: null, tolovYozilgan: null });
    const n = zanjirHisobla(k);
    expect(n.keyingi).toMatchObject({ id: 'aosr', aniq: true });
    expect(n.keyingi?.sabab).toBe('2 ta yashirin ish АОСР siz');
    expect(holatlar(k)).toMatchObject({ fakt: 'done', aosr: 'current', f2: 'not_started', f3: 'blocked' });
  });
  it('АОСР yopilgan, F2 yo‘q — F2 tayyorlang', () => {
    const k = tayyor({ f2BuOyda: false, f2TasdiqBuOyda: 0, forma3: null });
    expect(zanjirHisobla(k).keyingi).toMatchObject({ id: 'f2', amal: 'F2 tayyorlang' });
  });
  it('F2 qoralamada — tasdiqlang; Forma 3 blocked', () => {
    const k = tayyor({ f2BuOyda: true, f2TasdiqBuOyda: 0, forma3: null });
    expect(zanjirHisobla(k).keyingi).toMatchObject({ id: 'f2', amal: 'F2 ni tasdiqlang' });
    expect(holatlar(k).f3).toBe('blocked');
  });
  it('F2 tasdiqlangan, Forma 3 yo‘q — Forma 3', () => {
    const k = tayyor({ forma3: 0, tolovYozilgan: null });
    expect(zanjirHisobla(k).keyingi?.id).toBe('f3');
    expect(holatlar(k).tolov).toBe('blocked');
  });
  it('Forma 3 bor, to‘lov yozilmagan — to‘lov va akt-sverka', () => {
    const k = tayyor({ tolovYozilgan: 0 });
    expect(zanjirHisobla(k).keyingi).toMatchObject({ id: 'tolov', amal: 'To‘lov va akt-sverka', aniq: true });
  });
});

describe('zanjirHisobla — slichitelniy va sonlar', () => {
  it('to‘lov yozilgan, smetadan farqli qatorlar bor — slichitelniy tavsiya, sondan', () => {
    const k = tayyor({ slichitelniy: { farqli: 4, barglar: 9 } });
    expect(zanjirHisobla(k).keyingi).toMatchObject({ id: 'slichitelniy', amal: 'Slichitelniyni oching', sabab: '4 qatorda farq bor', aniq: true });
    expect(zanjirHisobla(k).tugallandi).toBe(false);
  });
  it('slichitelniy hisoblanmagan (null) — unknown, 0 farq emas', () => {
    const k = tayyor({ slichitelniy: null });
    expect(holatlar(k).slichitelniy).toBe('unknown');
    expect(zanjirHisobla(k).keyingi).toMatchObject({ id: 'slichitelniy', aniq: false });
  });
  it('F2 tasdiqlanmagan — slichitelniy blocked', () => {
    const k = tayyor({ f2BuOyda: true, f2TasdiqBuOyda: 0, forma3: null, tolovYozilgan: null, slichitelniy: { farqli: 3, barglar: 9 } });
    expect(holatlar(k)).toMatchObject({ f2: 'current', slichitelniy: 'blocked' });
  });
  it('smeta, fakt va АОСР izohlarida sonlar; sonlar yo‘q bo‘lsa umumiy matn', () => {
    const q = zanjirHisobla(tayyor({ smetaQator: 120, faktQamrov: 63, aosr: { yashirin: 5, aktsiz: 1 } })).qadamlar;
    expect(q.find((x) => x.id === 'smeta')?.izoh).toBe('120 ish qatori, hammasi narxlangan');
    expect(q.find((x) => x.id === 'fakt')?.izoh).toBe('3 ta fakt akti, qamrov 63%');
    expect(zanjirHisobla(tayyor()).qadamlar.find((x) => x.id === 'smeta')?.izoh).toBe('Smeta yuklangan va narxlangan');
  });
});

describe('zanjirDaraxtdan / zanjirRolKoradi', () => {
  const rows = [{ id: 1, tur: 'rz' }, { id: 2, tur: 'bl' }, { id: 3, tur: 'bl' }, { id: 4, tur: 'rs' }];
  it('bo‘sh daraxt — hammasi null (0 emas)', () => {
    expect(zanjirDaraxtdan([], [], 3)).toEqual({ smetaQator: null, faktQamrov: null, slichitelniy: null });
  });
  it('faktsiz — qamrov 0%; fakti borlar ulushi yaxlitlanadi', () => {
    expect(zanjirDaraxtdan(rows, [], 0)).toMatchObject({ smetaQator: 2, faktQamrov: 0, slichitelniy: { farqli: 0, barglar: 2 } });
    expect(zanjirDaraxtdan(rows, [{ qator_id: 2, fakt_hajm: 1 }, { qator_id: 3, fakt_hajm: 0 }], null)).toMatchObject({ faktQamrov: 50, slichitelniy: null });
  });
  it('faqat pudratchi rollari (rol noma‘lum — ko‘rinadi)', () => {
    for (const r of ['pto', 'boss', 'prorab', null, undefined]) expect(zanjirRolKoradi(r)).toBe(true);
    for (const r of ['buyurtmachi', 'inspektor', 'loyihachi']) expect(zanjirRolKoradi(r)).toBe(false);
  });
});

describe('zanjirHisobla — noma‘lum (NULL ≠ 0)', () => {
  it('hamma ma‘lumot null — hech qadam done emas, hech narsa 0 deb olinmaydi', () => {
    const k: ZanjirKirish = { smeta: { bor: null, narxsiz: null }, faktSaqlangan: null, faktQoralama: null, aosr: null, f2BuOyda: null, f2TasdiqBuOyda: null, forma3: null, tolovYozilgan: null, oy: '2026-11' };
    const n = zanjirHisobla(k);
    expect(n.qadamlar.map((q) => q.holat)).toEqual(['unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown']);
    expect(n.tugallandi).toBe(false);
    expect(n.keyingi).toMatchObject({ id: 'smeta', aniq: false });
  });
  it('АОСР noma‘lum (sahifada o‘qilmagan) — done emas; F2 tavsiya + «АОСР noma‘lum» eslatma', () => {
    const k = tayyor({ aosr: null, f2BuOyda: false, f2TasdiqBuOyda: 0, forma3: null });
    const n = zanjirHisobla(k);
    expect(holatlar(k).aosr).toBe('unknown');
    expect(n.keyingi?.id).toBe('f2');
    expect(n.keyingi?.eslatma).toContain('АОСР');
  });
  it('faqat to‘lov noma‘lum (F3 tayyor) — to‘lov tavsiya qilinadi, lekin aniq emas; tugallandi emas', () => {
    const n = zanjirHisobla(tayyor({ tolovYozilgan: null }));
    expect(n.keyingi).toMatchObject({ id: 'tolov', aniq: false });
    expect(n.tugallandi).toBe(false);
  });
  it('akt reestri o‘qilmadi — fakt/F2 unknown (0 emas), smeta esa ma‘lum', () => {
    const k = zanjirKirishYasa({ obyekt: { jami: 100, narxsiz: 0 }, aktlar: null, oy: '2026-11' });
    expect(holatlar(k)).toMatchObject({ smeta: 'done', fakt: 'unknown', f2: 'unknown' });
  });
  it('narxsiz soni noma‘lum — smeta done emas', () => {
    expect(holatlar(tayyor({ smeta: { bor: true, narxsiz: null } })).smeta).toBe('unknown');
  });
  it('Forma 3 noma‘lum, lekin F2 hali yo‘q — blocked (noma‘lum emas)', () => {
    expect(holatlar(tayyor({ f2BuOyda: false, f2TasdiqBuOyda: 0, forma3: null })).f3).toBe('blocked');
  });
});

describe('zanjirKirishYasa (akt reestridan)', () => {
  const akt = (o: Partial<MarkazAkt>): MarkazAkt => ({ tur: 'fakt', holat: 'tasdiqlangan', lifecycle_status: null, oy: '2026-11-01', yaratildi: '2026-11-03T10:00:00Z', hujjat_jami: 1, yozilgan_jami: 1, ...o });
  it('obyekt topilmadi — smeta noma‘lum; jami null — smeta yo‘q', () => {
    expect(zanjirKirishYasa({ obyekt: null, aktlar: [], oy: '2026-11' }).smeta).toEqual({ bor: null, narxsiz: null });
    expect(zanjirKirishYasa({ obyekt: { jami: null, narxsiz: null }, aktlar: [], oy: '2026-11' }).smeta).toEqual({ bor: false, narxsiz: null });
  });
  it('bekor qilingan F2 hisobga olinmaydi; boshqa oydagi F2 shu oyni yopmaydi', () => {
    const k = zanjirKirishYasa({ obyekt: { jami: 5, narxsiz: 0 }, aktlar: [akt({}), akt({ tur: 'f2', holat: 'bekor' }), akt({ tur: 'f2', oy: '2026-10-01' })], oy: '2026-11', aosr: { yashirin: 0, aktsiz: 0 } });
    expect(k.f2BuOyda).toBe(false);
    const f2 = zanjirHisobla(k).qadamlar.find((q) => q.id === 'f2')!;
    expect(f2.holat).toBe('not_started');
    expect(f2.izoh).toBe('Bu oyda yo‘q · jami 1 ta tasdiqlangan F-2 (oxirgisi 2026-10)');
  });
  it('fakt qoralama va saqlangan alohida sanaladi', () => {
    const k = zanjirKirishYasa({ obyekt: { jami: 5, narxsiz: 0 }, aktlar: [akt({}), akt({ holat: 'qoralama' })], oy: '2026-11' });
    expect(k).toMatchObject({ faktSaqlangan: 1, faktQoralama: 1 });
  });
});

describe('zanjirHisobla — obyekt darajasi vs oy darajasi (Stella va haykal xatosi)', () => {
  const akt = (o: Partial<MarkazAkt>): MarkazAkt => ({ tur: 'fakt', holat: 'tasdiqlangan', lifecycle_status: null, oy: '2026-03-01', yaratildi: '2026-03-03T10:00:00Z', hujjat_jami: 1, yozilgan_jami: 1, ...o });
  /** O‘tgan oylarda tasdiqlangan F-2 lar va saqlangan fakt, joriy oyda faqat 2 fakt qoralama. */
  const stella = () => zanjirKirishYasa({
    obyekt: { jami: 100, narxsiz: 62 },
    aktlar: [
      akt({}), akt({ oy: '2025-07-01' }),
      akt({ tur: 'f2', oy: '2025-07-01' }), akt({ tur: 'f2', oy: '2026-02-01' }), akt({ tur: 'f2', oy: '2026-03-01' }),
      akt({ holat: 'qoralama', oy: '2026-11-01' }), akt({ holat: 'qoralama', oy: '2026-11-01' }),
    ],
    oy: '2026-11',
    aosrReestr: { jami: 34, boglanmagan: 0 },
    slichitelniy: { farqli: 9, barglar: 40 },
  });
  const qadam = (id: string) => zanjirHisobla(stella()).qadamlar.find((q) => q.id === id)!;
  it('hech qaysi qadam «Avval … kerak» bilan bloklanmaydi', () => {
    for (const q of zanjirHisobla(stella()).qadamlar) {
      expect(q.holat).not.toBe('blocked');
      expect(q.izoh).not.toMatch(/Avval/);
    }
  });
  it('АОСР — obyekt darajasida jami soni; Slichitelniy — ochiq, farq va F-2 soni bilan', () => {
    expect(qadam('aosr')).toMatchObject({ holat: 'done', izoh: '34 ta АОСР, hammasi ishga bog‘langan' });
    expect(qadam('slichitelniy')).toMatchObject({ holat: 'not_started' }); // smeta (62 narxsiz) hozirgi qadam, slichitelniy bloklanmagan
    expect(qadam('slichitelniy').izoh).toBe('9 qatorda farq bor · 3 ta tasdiqlangan F-2');
  });
  it('АОСР bog‘lanmaganlar soni ko‘rsatiladi', () => {
    const k = { ...stella(), aosrReestr: { jami: 34, boglanmagan: 5 } };
    expect(zanjirHisobla(k).qadamlar.find((q) => q.id === 'aosr')).toMatchObject({ holat: 'not_started', izoh: '34 ta АОСР, 5 tasi ishga bog‘lanmagan' });
  });
  it('F-2 va Forma 3 — «Bu oyda yo‘q» + yig‘ma (oxirgi oy), zanjirni to‘smaydi', () => {
    expect(qadam('f2')).toMatchObject({ holat: 'not_started', izoh: 'Bu oyda yo‘q · jami 3 ta tasdiqlangan F-2 (oxirgisi 2026-03)' });
    expect(qadam('f3')).toMatchObject({ holat: 'not_started' });
    expect(qadam('f3').izoh).toBe('Bu oyda yo‘q · jami 3 ta tasdiqlangan F-2 (oxirgisi 2026-03)');
  });
  it('fakt qoralamasi ko‘rinadi, lekin saqlangan faktlar soni bilan', () => {
    expect(qadam('fakt').izoh).toBe('2 ta fakt qoralamada · 2 ta saqlangan');
  });
  it('obyektda umuman fakt yo‘q — eski «Avval fakt kerak» saqlanadi', () => {
    const k = zanjirKirishYasa({ obyekt: { jami: 100, narxsiz: 0 }, aktlar: [], oy: '2026-11', aosrReestr: { jami: 0, boglanmagan: 0 } });
    const h = Object.fromEntries(zanjirHisobla(k).qadamlar.map((q) => [q.id, q]));
    expect(h.aosr).toMatchObject({ holat: 'blocked', izoh: 'Avval fakt kerak' });
    expect(h.f2).toMatchObject({ holat: 'blocked', izoh: 'Avval fakt kerak' });
    expect(h.f3).toMatchObject({ holat: 'blocked', izoh: 'Avval F2 tasdiqlanishi kerak' });
    expect(h.slichitelniy).toMatchObject({ holat: 'blocked', izoh: 'Avval F2 tasdiqlanishi kerak' });
  });
});

describe('Nakopitelniy qadami (F-2 va Forma 3 orasida)', () => {
  const qadam = (k: ZanjirKirish, id: string) => zanjirHisobla(k).qadamlar.find((q) => q.id === id)!;
  it('tartib: F2 dan keyin, Forma 3 dan oldin; yo‘l — nakopitelniy sahifasi', () => {
    expect(ZANJIR_TARTIB.indexOf('nakopitelniy')).toBe(ZANJIR_TARTIB.indexOf('f2') + 1);
    expect(ZANJIR_TARTIB.indexOf('nakopitelniy')).toBeLessThan(ZANJIR_TARTIB.indexOf('f3'));
  });
  it('tasdiqlangan F-2 bor — done, oxirgi F-2 oyi izohda; tavsiyani to‘smaydi', () => {
    const k = tayyor({ f2TasdiqJami: 3, f2OxirgiOy: '2026-03', f2TasdiqBuOyda: 0, f2BuOyda: false });
    expect(qadam(k, 'nakopitelniy')).toMatchObject({ holat: 'done' });
    expect(qadam(k, 'nakopitelniy').izoh).toBe('2026-03 gacha tasdiqlangan F-2 lar asosida tayyor');
  });
  it('F-2 umuman yo‘q — blocked (Avval F2 tasdiqlanishi kerak); noma‘lum — unknown, 0 emas', () => {
    expect(qadam(tayyor({ f2TasdiqJami: 0, f2TasdiqBuOyda: 0 }), 'nakopitelniy')).toMatchObject({ holat: 'blocked', izoh: 'Avval F2 tasdiqlanishi kerak' });
    expect(qadam(tayyor({ f2TasdiqJami: null, f2TasdiqBuOyda: null, f2BuOyda: null }), 'nakopitelniy').holat).toBe('unknown');
  });
});