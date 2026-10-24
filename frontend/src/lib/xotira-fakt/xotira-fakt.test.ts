import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import { sozniOgir, xotiraSozlari } from './lugat';
import { miqdorOqi, qatorlarniOqi } from './parse';
import { birlikTahlil, sozMos, xotiraIndeks, xotiraMosla, xotiraQidiruv, type XotiraHolat } from './moslash';
import { birlikKatSummalari, hajmniHisobla, savatHajmi, savatJami, savatPaketi, savatdanOlish, savatgaQosh } from './savat';

describe('lug‘at va transliteratsiya', () => {
  it('o‘zbekcha → ruscha, qo‘shimchali shakllar, lotin → kirill, marka', () => {
    expect(sozniOgir('beton')).toBe('БЕТОН');
    expect(sozniOgir("g'isht")).toBe('КИРПИЧ');
    expect(sozniOgir('tubiga')).toBe('ДНО');
    expect(sozniOgir('betonni')).toBe('БЕТОН');
    expect(sozniOgir('geomembrana')).toBe('ГЕОМЕМБРАНА');
    expect(sozniOgir('shcheben')).toBe('ЩЕБЕНЬ');
    expect(sozniOgir('b25')).toBe('В25');
    expect(sozniOgir('БЕТОН')).toBe('БЕТОН');
    expect(xotiraSozlari('kanal tubiga beton')).toEqual(['КАНАЛ', 'ДНО', 'БЕТОН']);
    expect(xotiraSozlari('устройство для бетона')).toEqual(['УСТРОЙСТВО', 'БЕТОНА']);
  });
  it('ruscha so‘z shakllari bir o‘zakdan', () => {
    expect(sozMos('ГЕОМЕМБРАНА', 'ГЕОМЕМБРАНЫ')).toBe(true);
    expect(sozMos('БЕТОН', 'БЕТОНА')).toBe(true);
    expect(sozMos('БЕТОН', 'БЕТОННОЙ')).toBe(true);
    expect(sozMos('ГРУНТ', 'ГРАНИТ')).toBe(false);
    expect(sozMos('В25', 'В15')).toBe(false);
  });
});

describe('matnni qatorlarga ajratish', () => {
  it('«nom miqdor birlik», «miqdor birlik nom», foiz, hammasi', () => {
    const q = qatorlarniOqi('kanal tubiga beton 120 m3\ngeomembrana 3500 m2\n1. poydevor 50%\narmatura hammasi\n12,5 kg sim\nnoma\'lum ish');
    expect(q.map((x) => [x.nom, x.turi, x.qiymat, x.birlik])).toEqual([
      ['kanal tubiga beton', 'son', 120, 'М3'],
      ['geomembrana', 'son', 3500, 'М2'],
      ['poydevor', 'foiz', 50, null],
      ['armatura', 'hammasi', null, null],
      ['sim', 'son', 12.5, 'КГ'],
      ["noma'lum ish", 'yoq', null, null],
    ]);
  });
  it('miqdor maydoni', () => {
    expect(miqdorOqi('120')).toEqual({ turi: 'son', qiymat: 120 });
    expect(miqdorOqi('12,5')).toEqual({ turi: 'son', qiymat: 12.5 });
    expect(miqdorOqi('50%')).toEqual({ turi: 'foiz', qiymat: 50 });
    expect(miqdorOqi('qoldiq hammasi')).toEqual({ turi: 'hammasi', qiymat: null });
    expect(miqdorOqi('')).toEqual({ turi: 'yoq', qiymat: null });
    expect(birlikTahlil('100М3')).toEqual({ koef: 100, baza: 'М3' });
  });
});

// ── Sintetik obyekt smetasi ───────────────────────────────────────────────────────────────────────────────────
let id = 0;
const rows: T2Qator[] = [];
const q = (o: Partial<T2Qator> & { tur: string; nom: string }) => { const x = { id: ++id, obyekt_id: 1, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: id, kod: null, birlik: null, hajm: null, narx: null, summa: null, kat: null, ...o } as T2Qator; rows.push(x); return x.id; };
const R0 = q({ tur: 'rz', nom: 'РАЗДЕЛ: КОНСТРУКТИВНАЯ ЧАСТЬ-ОЗЕРА' });
const RZ = q({ tur: 'rz', nom: 'ЗЕМЛЯНЫЕ РАБОТЫ', ota_id: R0 });
const GRUNT = q({ tur: 'bl', nom: 'РАЗРАБОТКА ГРУНТА ЭКСКАВАТОРАМИ', ota_id: RZ, kod: 'E1-1-1', birlik: '1000М3', hajm: 12 });
const RK = q({ tur: 'rz', nom: 'КАНАЛ', ota_id: R0 });
const BP = q({ tur: 'bl', nom: 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ ПОД КАНАЛ', ota_id: RK, kod: 'E6-1-24-4', birlik: 'М3', hajm: 300 });
const BETON = q({ tur: 'mat', nom: 'БЕТОН ТЯЖЕЛЫЙ В7,5', ota_id: BP, kod: '12-575-1', birlik: 'М3', hajm: 306, narx: 500000, summa: 153000000, kat: 'МАТ' });
q({ tur: 'rs', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', ota_id: BP, birlik: 'ЧЕЛ-Ч', hajm: 900, narx: 20000, summa: 18000000, kat: 'ЧЕЛ' });
const RG = q({ tur: 'rz', nom: 'ГИДРОИЗОЛЯЦИЯ', ota_id: R0 });
const GEO = q({ tur: 'bl', nom: 'УКЛАДКА ГЕОМЕМБРАНЫ HDPE', ota_id: RG, kod: 'E11-2-1', birlik: 'М2', hajm: 5000 });
q({ tur: 'mat', nom: 'ГЕОМЕМБРАНА HDPE 1,5 ММ', ota_id: GEO, birlik: 'М2', hajm: 5250, narx: 40000, summa: 210000000, kat: 'МАТ' });
const OKL = q({ tur: 'bl', nom: 'УСТРОЙСТВО ОКЛЕЕЧНОЙ ГИДРОИЗОЛЯЦИИ', ota_id: RG, kod: 'E11-2-2', birlik: 'М2', hajm: 800 });
const PODP = q({ tur: 'rz', nom: 'ПОДПОРНАЯ СТЕНА', ota_id: R0 });
const STENA = q({ tur: 'bl', nom: 'УСТРОЙСТВО СТЕН ПОДПОРНЫХ ИЗ БЕТОНА В15', ota_id: PODP, birlik: '100М3', hajm: 40 });
const states: XotiraHolat[] = [
  { qator_id: GRUNT, smeta_hajm: 12, fakt_hajm: 2, f2_hajm: 1 },
  { qator_id: BP, smeta_hajm: 300, fakt_hajm: 100, f2_hajm: 80 },
  { qator_id: GEO, smeta_hajm: 5000, fakt_hajm: 0, f2_hajm: 0 },
  { qator_id: OKL, smeta_hajm: 800, fakt_hajm: 800, f2_hajm: 800 },
  { qator_id: STENA, smeta_hajm: 40, fakt_hajm: 0, f2_hajm: 0 },
];
const ind = xotiraIndeks(rows, states);

describe('matn → smeta qatoriga moslash', () => {
  it('«kanal tubiga beton 120 m3» → bo‘lim yo‘li bilan betonli tayyorlash; qoldiq va F2 yopilgani ko‘rinadi', () => {
    const [n] = xotiraMosla(qatorlarniOqi('kanal tubiga beton 120 m3'), ind);
    expect(n.nomzodlar[0]).toMatchObject({ qatorId: BP, yol: expect.stringContaining('КАНАЛ'), smetaHajm: 300, faktHajm: 100, f2Hajm: 80, qoldiq: 200, birlikMos: true, miqdor: 120, sigadi: true });
    expect(['aniq', 'taklif']).toContain(n.holat);
  });
  it('«geomembrana 3500 m2» → УКЛАДКА ГЕОМЕМБРАНЫ (so‘z shakli farqi); hajm qoldiqqa sig‘adi', () => {
    const [n] = xotiraMosla(qatorlarniOqi('geomembrana 3500 m2'), ind);
    expect(n.nomzodlar[0].qatorId).toBe(GEO);
    expect(n.nomzodlar[0]).toMatchObject({ qoldiq: 5000, sigadi: true });
  });
  it('birlik 100М3 ↔ m3: miqdor smeta birligiga o‘tkaziladi; qoldiqdan oshsa faqat belgi (blok yo‘q)', () => {
    const [n] = xotiraMosla(qatorlarniOqi('podpor devor beton b15 9000 m3'.replace('podpor devor', 'tayanch devor')), ind);
    const s = n.nomzodlar.find((x) => x.qatorId === STENA)!;
    expect(s).toBeTruthy();
    expect(s.miqdor).toBeCloseTo(90);              // 9000 м3 = 90 × [100М3]
    expect(s.sigadi).toBe(false);                  // qoldiq 40
  });
  it('hech narsa topilmasa — topilmadi, nomzodsiz', () => {
    const [n] = xotiraMosla(qatorlarniOqi('samolyot dvigateli 2 dona'), ind);
    expect(n.holat).toBe('topilmadi');
    expect(n.nomzodlar.length).toBe(0);
  });
  it('qidiruv: nom, kod va razdel bo‘yicha; qoldiq ko‘rinadi', () => {
    expect(xotiraQidiruv(ind, 'grunt')[0].qatorId).toBe(GRUNT);
    expect(xotiraQidiruv(ind, 'E11-2-2')[0].qatorId).toBe(OKL);
    const gidro = xotiraQidiruv(ind, 'gidroizolyatsiya');
    expect(gidro.map((x) => x.qatorId)).toContain(OKL);
    expect(gidro.find((x) => x.qatorId === OKL)?.qoldiq).toBe(0);
    expect(xotiraQidiruv(ind, 'x')).toEqual([]);
  });
});

describe('Fakt savati', () => {
  const mosBP = xotiraMosla(qatorlarniOqi('beton tayyorlash kanal 120 m3'), ind)[0].nomzodlar.find((x) => x.qatorId === BP)!;

  it('miqdor turlari: son / foiz / qoldiq hammasi', () => {
    expect(hajmniHisobla('son', 120, mosBP)).toBe(120);
    expect(hajmniHisobla('foiz', 50, mosBP)).toBe(100);
    expect(hajmniHisobla('hammasi', null, mosBP)).toBe(200);
    expect(hajmniHisobla('yoq', null, mosBP)).toBeNull();
  });

  it('ish qo‘shilsa mat/ob resurslari guruh bo‘lib proporsional qo‘shiladi; paket bitta hujjat; ish hajmi o‘zgarsa resurs ergashadi', () => {
    let s = savatgaQosh([], rows, mosBP, 120, 'matn');
    expect(s.map((x) => [x.qatorId, x.hajm, x.guruh])).toEqual([[BP, 120, null], [BETON, 122.4, BP]]);
    s = savatHajmi(s, rows, BP, 150);
    expect(s.find((x) => x.qatorId === BETON)?.hajm).toBe(153);
    s = savatHajmi(s, rows, BETON, 160);                         // resurs qo‘lda
    s = savatHajmi(s, rows, BP, 100);
    expect(s.find((x) => x.qatorId === BETON)?.hajm).toBe(160);  // qo‘lda tegilgan — qayta hisoblanmaydi
    expect(savatPaketi(s)).toEqual([{ qator_id: BP, hajm: 100 }, { qator_id: BETON, hajm: 160 }]);
    expect(savatdanOlish(s, BP)).toEqual([]);
  });

  it('bir qatorni ikki marta qo‘shish hajmni jamlaydi; qoldiqdan oshsa oshdi belgisi', () => {
    let s = savatgaQosh([], rows, mosBP, 120, 'matn');
    s = savatgaQosh(s, rows, mosBP, 100, 'qidiruv');
    expect(s.find((x) => x.qatorId === BP)).toMatchObject({ hajm: 220, oshdi: true });
  });

  it('jami: ishning resurslari bo‘yicha asos va kategoriya koeffitsientli ustamali summa (resurs ikki marta sanalmaydi)', () => {
    const s = savatgaQosh([], rows, mosBP, 100, 'matn');
    expect(birlikKatSummalari(rows, BP).narx).toBeCloseTo((153000000 + 18000000) / 300);
    const nk = { 'ПРОЧИЕ_ПОДРЯДЧИК': 18, 'СТРАХОВАНИЕ': 0.32, 'РИСК': 0, 'НДС': 12, 'ТРАНSPORT_МАТЕРИАЛ': 0 } as never;
    const j0 = savatJami(s, null);
    expect(j0.asos).toBeCloseTo((153000000 + 18000000) / 3, 0);
    expect(j0.ustamali).toBeNull();
    const j = savatJami(s, nk);
    expect(j.ustamali!).toBeGreaterThan(j.asos);
    expect(j.narxsiz).toBe(0);
  });
});
