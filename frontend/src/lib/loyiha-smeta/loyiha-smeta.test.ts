/** Sintetik fixturalar (real chizma/raqam YO'Q): profil parserlari, matcher, farq/pul, revizya. */
import { describe, expect, it } from 'vitest';
import { birlikTahlil, normMiqdor } from './birlik';
import type { MatnBo } from './jadval';
import { dublikatTanla, hujjatniTahlilQil, sahifaniTahlilQil, varaqKalit, varaqBelgisi, aiNarxiTaxmini } from './tahlil';
import { bolimXaritasi, kalitRaqamlar, moslash, type SmetaQator } from './moslash';
import { farqJami, farqlarniHisobla, type FarqMiqdor } from './farq';
import { revizyaFarqi } from './revizya';
import { qqsBilan, qatorSumma } from '../hisob-yadro';

const X = [20, 80, 300, 380];
/** Jadval fixturasi: har katak alohida matn elementi; qatorlar 12 birlik oralig'ida. */
function jadval(sahifa: number, qatorlar: (string | null)[][], shtamp = 'КР-5', y0 = 100): MatnBo[] {
  const out: MatnBo[] = [];
  qatorlar.forEach((q, i) => q.forEach((s, j) => { if (s != null) out.push({ s, x: X[j], y: y0 + i * 12, w: s.length * 5, h: 8, sahifa }); }));
  if (shtamp) out.push({ s: `Шифр ${shtamp}`, x: 400, y: 800, w: 60, h: 8, sahifa });
  return out;
}

describe('birlik', () => {
  it('koeffitsiyentlar', () => {
    expect(birlikTahlil('100 м3')).toEqual({ baza: 'm3', koef: 100 });
    expect(normMiqdor(0.5, '100 м3')).toBe(50);
    expect(normMiqdor(1.5, 'т')).toBe(1500);
    expect(normMiqdor(null, 'м3')).toBeNull();
    expect(normMiqdor(3, 'xyz')).toBeNull();
    expect(birlikTahlil('п.м').baza).toBe('m');
  });
});

describe('varaq belgisi', () => {
  it('lotin/kirill va tire', () => {
    expect(varaqKalit('kr 5')).toBe('КР-5');
    expect(varaqKalit('KR-5.1')).toBe('КР-5.1');
    expect(varaqKalit('КР5')).toBe('КР-5');
  });
  it('shtampdan', () => {
    expect(varaqBelgisi(jadval(1, [['a', 'b', 'c', 'd']], 'КР-7'))).toBe('КР-7');
  });
});

describe('profil parserlari', () => {
  it('beton hajm jadvali + ko\'p qatorli katak + noma\'lum miqdor', () => {
    const it1 = jadval(1, [
      ['Поз.', 'Наименование', 'Ед. изм.', 'Объем, м3'],
      ['П1', 'Плита фундаментная', 'м3', '12,5'],
      ['П2', 'Колонна монолитная', 'м3', '3,2'],
      [null, 'Ø400 бетон В25', null, null],
      ['П3', 'Стена', 'м3', null],
    ]);
    const r = sahifaniTahlilQil(it1, 1);
    expect(r.varaq).toBe('КР-5');
    expect(r.profil).toBe('beton_hajm');
    expect(r.elementlar.map((e) => e.miqdor)).toEqual([12.5, 3.2, null]);
    expect(r.elementlar[1].nom).toContain('бетон В25');
    expect(r.elementlar[1].ogohlantirish).toContain('kop_qatorli');
    expect(r.elementlar[2].ogohlantirish).toContain('miqdor_yoq');
    expect(r.elementlar.every((e) => e.birlik === 'м3')).toBe(true);
    expect(r.elementlar[0].qutisi.x1).toBeGreaterThan(r.elementlar[0].qutisi.x0);
  });

  it('armatura: to\'r qatori (п.м) va jami tekshiruvi', () => {
    const qat = (jami: string) => jadval(2, [
      ['Поз.', 'Наименование', 'Ед. изм.', 'Масса, кг'],
      ['1', 'Арматура А500 Ø12', 'кг', '1000'],
      ['2', 'Арматура А240 Ø8', 'кг', '200'],
      ['С-1', 'Сетка С-1', 'п.м', '45'],
      [null, 'Итого', null, jami],
    ], 'КЖ-2');
    const ok = sahifaniTahlilQil(qat('1200'), 2);
    expect(ok.profil).toBe('armatura');
    expect(ok.elementlar).toHaveLength(3);
    const tor = ok.elementlar[2];
    expect(tor.birlik).toBe('п.м'); expect(tor.miqdor).toBe(45); expect(tor.ogohlantirish).toContain('tor');
    expect(ok.elementlar.some((e) => e.ogohlantirish.includes('jami_mos_emas'))).toBe(false);
    const xato = sahifaniTahlilQil(qat('1500'), 2);
    expect(xato.elementlar.every((e) => e.ogohlantirish.includes('jami_mos_emas') && e.ishonch <= 0.5)).toBe(true);
  });

  it('uskuna: har doim odam tasdiqlashi kerak, ishonch past', () => {
    const r = sahifaniTahlilQil(jadval(3, [
      ['Поз.', 'Наименование', 'Ед. изм.', 'Кол.'],
      ['1', 'Насос циркуляционный', 'шт', '2'],
      ['2', 'Светильник LED', 'шт', '40'],
    ], 'ЭО-1'), 3);
    expect(r.profil).toBe('uskuna');
    expect(r.elementlar.every((e) => e.odamKerak && e.ishonch <= 0.3)).toBe(true);
    expect(r.aiTaklifi).toBe(true);
  });

  it('o\'qib bo\'lmaydigan sahifa AI ga taklif qilinadi; narx oldindan ko\'rinadi, kesh bepul', () => {
    const bo: MatnBo[] = Array.from({ length: 10 }, (_, i) => ({ s: 'xxx' + i, x: 10 + i * 30, y: 50, w: 20, h: 8, sahifa: 1 }));
    const r = hujjatniTahlilQil([...bo, ...bo.map((b) => ({ ...b, sahifa: 2 }))]);
    expect(r.every((x) => x.aiTaklifi && x.sabab === 'profil_yoq')).toBe(true);
    expect(aiNarxiTaxmini(r, new Set(['f:1']), 50, 'f')).toEqual({ sahifalar: 2, bepul: 1, token: 50 });
  });

  it('dublikat varaq: yuqori revizya tanlanadi', () => {
    const { tanlangan, almashgan } = dublikatTanla([
      { varaq: 'КР-5', revizya: 0, id: 'a' }, { varaq: 'КР-5', revizya: 2, id: 'b' }, { varaq: 'КР-6', revizya: null, id: 'c' }, { varaq: null, revizya: null, id: 'd' },
    ]);
    expect(tanlangan.map((x) => x.id).sort()).toEqual(['b', 'c', 'd']);
    expect(almashgan.map((x) => x.id)).toEqual(['a']);
  });
});

const smeta: SmetaQator[] = [
  { id: 1, ota_id: null, tur: 'rz', nom: 'Монолитные конструкции (КР-5)', birlik: null, hajm: null, narx: null },
  { id: 2, ota_id: 1, tur: 'rs', nom: 'Бетон монолитный В25 фундаментов', birlik: '100 м3', hajm: 0.1, narx: 90_000_000 },
  { id: 3, ota_id: 1, tur: 'rs', nom: 'Бетон монолитный В15 подготовки', birlik: 'м3', hajm: 5, narx: 800_000 },
  { id: 4, ota_id: null, tur: 'rz', nom: 'Прочие работы', birlik: null, hajm: null, narx: null },
  { id: 5, ota_id: 4, tur: 'rs', nom: 'Бетон монолитный В25 прочий', birlik: 'м3', hajm: 1, narx: 1 },
  { id: 6, ota_id: 1, tur: 'rs', nom: 'Устройство гидроизоляции', birlik: 'м2', hajm: 10, narx: 50_000 },
];

describe('matcher', () => {
  const xarita = bolimXaritasi(smeta);
  it('bo\'lim nomidagi varaq belgisi birlamchi kalit', () => {
    expect(xarita.get(2)?.belgilar.has('КР-5')).toBe(true);
    expect(xarita.get(5)?.belgilar.size).toBe(0);
  });
  it('kalit raqamlar', () => { expect(kalitRaqamlar('Бетон В25 Ø12 150 мм')).toEqual({ sinf: 'B25', diametr: '12', qalinlik: '150' }); });
  it('B25 beton 100 м3 qatoriga ball bilan taklif; hech qachon avto-qabul emas', () => {
    const r = moslash({ nom: 'Плита фундаментная бетон В25', belgi: 'П1', birlik: 'м3', tur: 'beton', varaq: 'КР-5' }, smeta, xarita);
    expect(r.nomzodlar[0].qatorId).toBe(2);
    expect(r.nomzodlar[0].sabab).toEqual(expect.arrayContaining(['bolim_belgi', 'birlik_mos', 'sinf_mos']));
    expect(r.nomzodlar.map((n) => n.qatorId)).not.toContain(6);
    expect(r.nomzodlar.map((n) => n.qatorId)).not.toContain(5);
  });
  it('bo\'limsiz belgi: ball 0.5 dan oshmaydi, ishonchli emas', () => {
    const r = moslash({ nom: 'Плита бетон В25', birlik: 'м3', tur: 'beton', varaq: 'КР-9' }, smeta, xarita);
    expect(r.ishonchli).toBe(false);
    expect(Math.max(...r.nomzodlar.map((n) => n.ball))).toBeLessThanOrEqual(0.5);
  });
  it('uskuna: odam tasdiqlashi kerak, nomzodsiz', () => {
    expect(moslash({ nom: 'Насос', birlik: 'шт', tur: 'uskuna', varaq: 'ЭО-1' }, smeta, xarita)).toEqual({ odamKerak: true, ishonchli: false, nomzodlar: [] });
  });
  it('sozlanadigan regex (kompaniya nomlashi)', () => {
    const q: SmetaQator[] = [{ id: 1, ota_id: null, tur: 'rz', nom: 'Раздел [лист КР/5]', birlik: null, hajm: null, narx: null }, { id: 2, ota_id: 1, tur: 'rs', nom: 'Бетон В25', birlik: 'м3', hajm: 1, narx: 1 }];
    const x = bolimXaritasi(q, 'лист\\s*([А-Я]+/\\d+)');
    expect([...(x.get(2)?.belgilar ?? [])]).toEqual(['КР-5']);
  });
});

describe('farq va pul (hisob-yadro)', () => {
  const m = (o: Partial<FarqMiqdor>): FarqMiqdor => ({
    miqdor_id: 1, varaq: 'КР-5', nom: 'Бетон В25', belgi: 'П1', tur: 'beton', birlik: 'м3', miqdor: 12, miqdor_norm: 12, baza: 'm3', qaror: null,
    boglar: [{ qator_id: 2, kod: null, nom: 'Бетон монолитный В25', birlik: '100 м3', hajm: 0.1, narx: 90_000_000, hajm_norm: 10, fakt: null, fakt_norm: null }], ...o,
  });
  it('100 м3 koeffitsiyenti: loyiha 12 m3 - smeta 10 m3 = 0.02 (100 m3) x narx; QQS bilan birinchi', () => {
    const r = farqlarniHisobla([m({})], smeta, new Set([2]));
    const f = r.find((x) => x.tur === 'hajm_farqi')!;
    expect(f.farq).toBeCloseTo(0.02, 10);
    expect(f.pulQQSsiz).toBe(qatorSumma(0.02, 90_000_000));
    expect(f.pulQQSbilan).toBe(qqsBilan(f.pulQQSsiz, 12));
  });
  it('tolerantlik ichida farq yo\'q', () => {
    expect(farqlarniHisobla([m({ miqdor: 10.1, miqdor_norm: 10.1 })], smeta, new Set([2])).filter((x) => x.tur === 'hajm_farqi')).toHaveLength(0);
  });
  it('loyihada bor - smetada yo\'q: narx noma\'lum -> null va narxsiz (0 emas)', () => {
    const r = farqlarniHisobla([m({ boglar: [] })], smeta, new Set());
    expect(r[0].tur).toBe('loyihada_bor_smetada_yoq');
    expect(r[0].pulQQSbilan).toBeNull(); expect(r[0].narxsiz).toBe(true);
    const t = farqJami(r);
    expect(t.kirmaganQQSbilan).toBe(0); expect(t.narxsizSoni).toBe(1);
  });
  it('taxminiy narx berilsa pul hisoblanadi', () => {
    const r = farqlarniHisobla([m({ boglar: [] })], smeta, new Set(), { taxminiyNarx: () => 1000 });
    expect(r[0].pulQQSsiz).toBe(12_000); expect(r[0].pulQQSbilan).toBe(13_440);
  });
  it('almashgan: beton sinfi farqi', () => {
    const r = farqlarniHisobla([m({ nom: 'Бетон В30', miqdor: 10, miqdor_norm: 10 })], smeta, new Set([2]));
    expect(r.map((x) => x.tur)).toContain('almashgan');
  });
  it('fakt loyihadan oshgan', () => {
    const b = { qator_id: 2, kod: null, nom: 'Бетон В25', birlik: 'м3', hajm: 12, narx: 1000, hajm_norm: 12, fakt: 15, fakt_norm: 15 };
    const r = farqlarniHisobla([m({ boglar: [b] })], smeta, new Set([2]));
    const f = r.find((x) => x.tur === 'fakt_oshgan')!;
    expect(f.farq).toBe(3); expect(f.pulQQSsiz).toBe(3000);
  });
  it('smetada bor - loyihada yo\'q: yuklangan varaq bo\'limida bog\'lanmagan qator', () => {
    const r = farqlarniHisobla([m({})], smeta, new Set([2]));
    expect(r.filter((x) => x.tur === 'smetada_bor_loyihada_yoq').map((x) => x.qatorId).sort()).toEqual([3, 6]);
  });
  it('jami: hujjatlashtirilgan va kirmagan alohida; eskirgan qaror hisobga kirmaydi', () => {
    const hujj = farqlarniHisobla([m({ qaror: { tur: 'qoshimcha', eskirgan: false, sabab: null } })], smeta, new Set([2])).filter((x) => x.tur === 'hajm_farqi');
    const eskir = farqlarniHisobla([m({ qaror: { tur: 'qoshimcha', eskirgan: true, sabab: null } })], smeta, new Set([2])).filter((x) => x.tur === 'hajm_farqi');
    expect(farqJami(hujj).hujjatQQSbilan).toBeGreaterThan(0); expect(farqJami(hujj).kirmaganQQSbilan).toBe(0);
    expect(farqJami(eskir).kirmaganQQSbilan).toBeGreaterThan(0); expect(farqJami(eskir).hujjatQQSbilan).toBe(0);
  });
});

describe('revizya farqi', () => {
  it('yangi / o\'zgargan / ayni / olingan va eskiradigan qarorlar', () => {
    const eski = [
      { tur: 'beton', belgi: 'P1', nom: 'A', birlik: 'м3', miqdor: 10, qarorBor: true },
      { tur: 'beton', belgi: 'P2', nom: 'B', birlik: 'м3', miqdor: 4 },
      { tur: 'beton', belgi: 'P3', nom: 'C', birlik: 'м3', miqdor: 1, qarorBor: true },
    ];
    const r = revizyaFarqi(eski, [
      { tur: 'beton', belgi: 'P1', nom: 'A', birlik: 'м3', miqdor: 12 },
      { tur: 'beton', belgi: 'P2', nom: 'B', birlik: 'м3', miqdor: 4 },
      { tur: 'beton', belgi: 'P4', nom: 'D', birlik: 'м3', miqdor: 2 },
    ]);
    expect([r.yangi.length, r.ozgargan.length, r.ayni.length, r.olingan.length, r.eskiradigan.length]).toEqual([1, 1, 1, 1, 2]);
  });
});
