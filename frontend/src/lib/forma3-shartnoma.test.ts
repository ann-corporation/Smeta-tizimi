/**
 * Shartnoma darajasidagi Forma 3: obyektlar bo'yicha yig'ish (har obyekt O'Z nakrutkasi bilan), band F2 chiqarilishi,
 * aktlar filtri, propis, Excel yaxlitligi. Real nom/summa YO'Q — sintetik fixture.
 */
import { describe, expect, it } from 'vitest';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import type { Forma3ShartnomaAkt } from '../api/t2-document-control';
import {
  f3AktlarniFiltrla, f3SanaOyIchida, f3ShartnomaYigish, forma3Hujjat, forma3ShartnomaHujjat,
  type F3DavrAkt, type Forma3Manba, type Forma3ShartnomaObyekt,
} from './forma3-export';
import { f3AktTanlov, f3OyChegarasi, f3YuboriladiganAktlar } from './forma3-shartnoma';
import { hujjatTekshir, summaSozBilan } from './hujjat-yozuvchi';

let seq = 1000;
function q(p: Partial<NakopitelniyQator> & { tur: NakopitelniyQator['tur'] }): NakopitelniyQator {
  seq++;
  return {
    qator_id: seq, tartib: seq, kod: null, nom: null, birlik: null, kat: null, qoshimcha: false, zamena: false,
    smeta_hajm: null, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0,
    oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0,
    jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
    jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
  };
}

/** Bir kategoriyali (МАТ) minimal obyekt: razdel → ish → bitta material bargi. */
function obyektManba(obyektId: number, nom: string, smeta: number, f2: Array<{ oy: string; summa: number; akt_id: number }>): { manba: Forma3Manba; barg: number } {
  const rz = q({ tur: 'rz', nom: 'РАЗДЕЛ 1' });
  const bl = q({ tur: 'bl', kod: 'Е01', nom: 'РАБОТА', birlik: 'м3', smeta_summa: smeta });
  const barg = q({ tur: 'mat', kat: 'МАТ', kod: 'С1', nom: 'МАТЕРИАЛ', birlik: 'м3', smeta_summa: smeta });
  return {
    barg: barg.qator_id,
    manba: {
      nakopitelniy: [{ obyekt_id: obyektId, obyektNom: nom, qatorlar: [rz, bl, barg] }],
      f2Oylik: f2.map((x) => ({ obyekt_id: obyektId, qator_id: barg.qator_id, oy: x.oy, summa: x.summa, akt_id: x.akt_id })),
    },
  };
}

const NK_A = { 'ТРАНСПОРТ_МАТЕРИАЛ': 5, 'СКЛАДСКИЕ_МАТЕРИАЛ': 2, 'СКЛАДСКИЕ_МК': 2, 'ТРАНСПОРТ_КАБЕЛЬ': 3, 'ПРОЧИЕ_ПОДРЯДЧИК': 10, 'ТРАНСПОРТ_ОБОРУД': 4, 'ЗАГОТ_СКЛАД_ОБОРУД': 1.5, 'СТРАХОВАНИЕ': 1, 'РИСК': 0, 'НДС': 12 };
/** Boshqa (kattaroq) kf lar: shu obyekt boshqa shartnoma shartlarida. */
const NK_B = { ...NK_A, 'ТРАНСПОРТ_МАТЕРИАЛ': 8, 'ПРОЧИЕ_ПОДРЯДЧИК': 15, 'СТРАХОВАНИЕ': 2 };

function ikkiObyekt(): Forma3ShartnomaObyekt[] {
  const a = obyektManba(1, 'Объект А', 10_000_000, [{ oy: '2026-02', summa: 1_000_000, akt_id: 11 }, { oy: '2026-03', summa: 2_000_000, akt_id: 12 }]);
  const b = obyektManba(2, 'Объект Б', 20_000_000, [{ oy: '2026-03', summa: 4_000_000, akt_id: 21 }]);
  return [
    { obyekt_id: 1, obyektNom: 'Объект А', manba: a.manba, nakrutka: NK_A },
    { obyekt_id: 2, obyektNom: 'Объект Б', manba: b.manba, nakrutka: NK_B },
  ];
}

describe('Forma 3 shartnoma — obyektlar bo‘yicha yig‘ish', () => {
  it('har obyekt O‘Z kf i bilan: obyekt summasi yagona obyekt-rejim F3 bilan teng, jami — yig‘indi', () => {
    const obs = ikkiObyekt();
    const y = f3ShartnomaYigish(obs, '2026-03');
    expect(y.obyektlar).toHaveLength(2);
    for (const ob of obs) {
      const yakka = forma3Hujjat(ob.manba, { obyektNom: ob.obyektNom, asosiyObyektId: ob.obyekt_id, davr: '2026-03', nakrutka: ob.nakrutka });
      const n = y.obyektlar.find((x) => x.obyekt_id === ob.obyekt_id)!;
      for (const c of ['G', 'H', 'I', 'J'] as const) {
        expect(n.ustun[c].itogo4).toBe(yakka.kaskad[c].itogo4);
        expect(n.ustun[c].vsego).toBe(yakka.kaskad[c].vsego);
      }
    }
    // Kf lar farqli → bir xil to'g'ri summaga har xil ustamali (nisbatlar teng emas).
    const [a, b] = y.obyektlar;
    expect(a.ustun.J.itogo4! / a.ustun.J.pryamye).not.toBeCloseTo(b.ustun.J.itogo4! / b.ustun.J.pryamye, 6);
    // Jami = obyektlar yig'indisi (tiyingacha).
    for (const c of ['G', 'H', 'I', 'J'] as const) {
      expect(y.jami[c].itogo4).toBeCloseTo(a.ustun[c].itogo4! + b.ustun[c].itogo4!, 2);
      expect(y.jami[c].vsego).toBeCloseTo(a.ustun[c].vsego! + b.ustun[c].vsego!, 2);
      expect(y.jami[c].pryamye).toBeCloseTo(a.ustun[c].pryamye + b.ustun[c].pryamye, 2);
    }
    // Davr (mart): A 2 mln, B 4 mln — H (с начала, narastayushchiy): A fevral 1 mln + mart 2 mln, B mart 4 mln = 7 mln.
    expect(y.jami.J.pryamye).toBeCloseTo(6_000_000, 2);
    expect(y.jami.H.pryamye).toBeCloseTo(7_000_000, 2);
    expect(y.jami.G.pryamye).toBeCloseTo(30_000_000, 2);
  });

  it('nakrutka foizlari yo‘q obyekt — summalari NULL (0 emas), jami ham bo‘sh va sababi yoziladi', () => {
    const obs = ikkiObyekt();
    obs[1] = { ...obs[1], nakrutka: null };
    const y = f3ShartnomaYigish(obs, '2026-03');
    expect(y.obyektlar[1].ustun.J.itogo4).toBeNull();
    expect(y.obyektlar[1].ustun.J.vsego).toBeNull();
    expect(y.jami.J.itogo4).toBeNull();
    expect(y.jami.J.vsego).toBeNull();
    expect(y.jami.J.pryamye).toBeGreaterThan(0); // прямые noma'lum emas
    expect(y.diqqat.some((d) => /ИТОГО ПО ДОГОВОРУ/.test(d.nom))).toBe(true);
    expect(y.obyektlar[0].ustun.J.itogo4).not.toBeNull();
  });

  it('«за отчетный месяц» — aktlar O‘Z podvali bilan (M12), kaskadni almashtiradi', () => {
    const obs = ikkiObyekt();
    const akt: F3DavrAkt = { aktId: 12, raqam: '12', hujjatPodvali: true, ustamasiz: 2_000_000, ustamali: 2_345_678.9, qqs: 281_481.47, qqsBilan: 2_627_160.37 };
    obs[0] = { ...obs[0], davrAktlari: [akt] };
    const y = f3ShartnomaYigish(obs, '2026-03');
    expect(y.obyektlar[0].ustun.J.itogo4).toBe(2_345_678.9);
    expect(y.obyektlar[0].ustun.J.qqs).toBe(281_481.47);
    expect(y.obyektlar[0].ustun.J.vsego).toBe(2_627_160.37);
    // Boshqa obyekt (aktlar berilmagan) — kaskad.
    const kask = f3ShartnomaYigish([obs[1]], '2026-03');
    expect(y.obyektlar[1].ustun.J.vsego).toBe(kask.obyektlar[0].ustun.J.vsego);
  });

  it('akt summasi noma‘lum (null) bo‘lsa obyekt va shartnoma oy jami bo‘sh — qisman yig‘indi yo‘q', () => {
    const obs = ikkiObyekt();
    const akt: F3DavrAkt = { aktId: 12, raqam: '12', hujjatPodvali: false, ustamasiz: 2_000_000, ustamali: null, qqs: null, qqsBilan: null };
    obs[0] = { ...obs[0], davrAktlari: [akt] };
    const y = f3ShartnomaYigish(obs, '2026-03');
    expect(y.obyektlar[0].ustun.J.vsego).toBeNull();
    expect(y.jami.J.vsego).toBeNull();
  });
});

describe('Forma 3 shartnoma — F2 aktlar tanlovi', () => {
  const akt = (id: number, ob: number, band: boolean, f3: number | null = null): Forma3ShartnomaAkt =>
    ({ akt_id: id, raqam: String(id), oy: '2026-03-01', obyekt_id: ob, obyekt_nom: `Объект ${ob}`, hujjat_jami: null, forma3_id: f3, band });

  const royxat = [akt(1, 2, false), akt(2, 1, false), akt(3, 1, true, 77), akt(4, 3, false)];

  it('boshqa F3 dagi (band) akt oldindan belgilanmaydi va yuborilmaydi; qolganlari belgilanadi', () => {
    const t = f3AktTanlov(royxat);
    expect(t.tanlangan.sort()).toEqual([1, 2, 4]);
    expect(t.band.map((a) => a.akt_id)).toEqual([3]);
    // Foydalanuvchi bandni "belgilashga" urinsa ham, begona id yuborsa ham — o'tmaydi.
    expect(f3YuboriladiganAktlar(royxat, new Set([1, 2, 3, 999]))).toEqual([1, 2]);
  });

  it('obyekt bo‘yicha guruhlanadi (nom tartibida)', () => {
    const g = f3AktTanlov(royxat).guruhlar;
    expect(g.map((x) => x.obyekt_id)).toEqual([1, 2, 3]);
    expect(g[0].aktlar.map((a) => a.akt_id)).toEqual([2, 3]);
  });

  it('tanlanmagan akt hisobot oyi summasidan chiqariladi, oldingi oylar qoladi', () => {
    const o = ikkiObyekt()[0];
    const f = f3AktlarniFiltrla(o.manba, '2026-03', new Set<number>());
    expect(f.f2Oylik.map((r) => r.oy)).toEqual(['2026-02']);
    const h = f3AktlarniFiltrla(o.manba, '2026-03', new Set([12]));
    expect(h.f2Oylik).toHaveLength(2);
    expect(f3AktlarniFiltrla(o.manba, '2026-03', null)).toBe(o.manba);
  });

  it('oy chegarasi: kabisa yili va noto‘g‘ri kirish', () => {
    expect(f3OyChegarasi('2028-02')).toEqual({ boshi: '2028-02-01', oxiri: '2028-02-29' });
    expect(f3OyChegarasi('2026-12')).toEqual({ boshi: '2026-12-01', oxiri: '2026-12-31' });
    expect(f3OyChegarasi('2026-13')).toBeNull();
    expect(f3OyChegarasi('')).toBeNull();
  });
});

describe('Forma 3 shartnoma — Excel hujjati', () => {
  const akt = (id: number, ustamasiz: number, ustamali: number, qqs: number): F3DavrAkt =>
    ({ aktId: id, raqam: String(id), hujjatPodvali: true, ustamasiz, ustamali, qqs, qqsBilan: Math.round((ustamali + qqs) * 100) / 100 });

  it('propis jami (oy) summasi uchun to‘g‘ri; hujjat bo‘sh emas, $-formula va keshsiz formula yo‘q', () => {
    const obs = ikkiObyekt();
    obs[0] = { ...obs[0], davrAktlari: [akt(12, 2_000_000, 2_400_000, 288_000)] };
    obs[1] = { ...obs[1], davrAktlari: [akt(21, 4_000_000, 4_900_000, 588_000)] };
    const h = forma3ShartnomaHujjat(obs, { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: 'TEST-1', shartnomaSumma: 30_000_000 });
    // 2 688 000 + 5 488 000 = 8 176 000,00
    expect(h.oyKOplate).toBe(8_176_000);
    expect(h.propis).toBe(`${summaSozBilan(8_176_000)} с НДС`);
    expect(h.propis).toContain('Восемь миллионов сто семьдесят шесть тысяч сум 00 тийин');
    const hisobot = hujjatTekshir(h.bytes);
    expect(hisobot.dollarFormulalar).toEqual([]);
    expect(hisobot.keshsizFormulalar).toEqual([]);
    expect(hisobot.varaqlar.length).toBe(3); // справка + akt ro'yxati + xizmat varag'i «Замечания» (zakazchik rekvizitlari berilmagan)
    expect(hisobot.matnlar.join('\n')).toContain('Объект А');
    expect(hisobot.matnlar.join('\n')).toContain('Объект Б');
    expect(h.faylNomi).toMatch(/\.xlsx$/);
  });

  it('noma‘lum summa — propis yo‘q (0 yozilmaydi)', () => {
    const obs = ikkiObyekt();
    obs[1] = { ...obs[1], nakrutka: null };
    const h = forma3ShartnomaHujjat(obs, { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: 'TEST-1' });
    expect(h.oyKOplate).toBeNull();
    expect(h.propis).toBeNull();
  });
});

describe('Forma 3 shartnoma — hujjat tuzilishi va kumulyativ ustunlar (egasi 2026-11-14 «xato hujjat»)', () => {
  const akt = (id: number, oy: string, ustamasiz: number, ustamali: number, qqs: number): F3DavrAkt =>
    ({ aktId: id, raqam: String(id), oy, hujjatPodvali: true, ustamasiz, ustamali, qqs, qqsBilan: Math.round((ustamali + qqs) * 100) / 100 });

  it('«с начала» va «с начала года» — aktlar O‘Z podvali yig‘indisi: birinchi F3 da «с начала» == «за месяц» (kaskad bilan emas)', () => {
    const obs = ikkiObyekt();
    // Akt o'z podvali obyektning joriy kaskadidan farq qiladi (eski foizlar) — kumulyativ ham shu bo'yicha bo'lishi shart.
    const a = akt(12, '2026-03', 2_000_000, 2_300_000, 276_000);
    obs[0] = { ...obs[0], davrAktlari: [a], aktlarJami: [a] };
    const y = f3ShartnomaYigish([obs[0]], '2026-03');
    const o = y.obyektlar[0].ustun;
    expect(o.J.vsego).toBe(2_576_000);
    expect(o.H).toEqual(o.J);
    expect(o.I).toEqual(o.J);
  });

  it('kumulyativ: oldingi oy akti H ga kiradi, I ga faqat joriy yil; sizning J — faqat hisobot oyi', () => {
    const obs = ikkiObyekt();
    const eski = akt(5, '2025-12', 1_000_000, 1_200_000, 144_000);
    const yangi = akt(12, '2026-03', 2_000_000, 2_300_000, 276_000);
    obs[0] = { ...obs[0], davrAktlari: [yangi], aktlarJami: [eski, yangi] };
    const o = f3ShartnomaYigish([obs[0]], '2026-03').obyektlar[0].ustun;
    expect(o.H.pryamye).toBe(3_000_000);
    expect(o.H.vsego).toBe(1_344_000 + 2_576_000);
    expect(o.I.vsego).toBe(2_576_000);
    expect(o.J.vsego).toBe(2_576_000);
    // hisobot oyidan keyingi akt (bo'lib qolsa) hech qaysi ustunga kirmaydi
    const kelgusi = akt(30, '2026-05', 9_000_000, 9_500_000, 1_140_000);
    obs[0] = { ...obs[0], aktlarJami: [eski, yangi, kelgusi] };
    expect(f3ShartnomaYigish([obs[0]], '2026-03').obyektlar[0].ustun.H.pryamye).toBe(3_000_000);
  });

  it('kumulyativda noma‘lum akt — H bo‘sh (null), 0 emas', () => {
    const obs = ikkiObyekt();
    const nom: F3DavrAkt = { aktId: 5, raqam: '5', oy: '2025-12', hujjatPodvali: false, ustamasiz: 1_000_000, ustamali: null, qqs: null, qqsBilan: null };
    const yangi = akt(12, '2026-03', 2_000_000, 2_300_000, 276_000);
    obs[0] = { ...obs[0], davrAktlari: [yangi], aktlarJami: [nom, yangi] };
    const y = f3ShartnomaYigish([obs[0]], '2026-03');
    expect(y.obyektlar[0].ustun.H.vsego).toBeNull();
    expect(y.obyektlar[0].ustun.I.vsego).toBe(2_576_000);
  });

  it('vid zatrat ko‘rsatilmagan (kat yo‘q) F2 summasi «прямые затраты» dan tushib qolmaydi', () => {
    const rz = q({ tur: 'rz', nom: 'РАЗДЕЛ' });
    const bl = q({ tur: 'bl', nom: 'РАБОТА', smeta_summa: 5_000_000 });
    const barg = q({ tur: 'mat', kat: null, nom: 'БЕЗ ВИДА ЗАТРАТ', smeta_summa: 5_000_000 });
    const manba: Forma3Manba = { nakopitelniy: [{ obyekt_id: 1, obyektNom: 'A', qatorlar: [rz, bl, barg] }], f2Oylik: [{ obyekt_id: 1, qator_id: barg.qator_id, oy: '2026-03', summa: 1_500_000, akt_id: 1 }] };
    const y = f3ShartnomaYigish([{ obyekt_id: 1, obyektNom: 'A', manba, nakrutka: NK_A }], '2026-03');
    expect(y.obyektlar[0].ustun.J.pryamye).toBe(1_500_000);
    expect(y.obyektlar[0].ustun.H.pryamye).toBe(1_500_000);
  });

  async function varaqlar(bytes: Uint8Array) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    return wb;
  }
  const matnlar = (ws: import('exceljs').Worksheet): string[] => {
    const out: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => { const v = c.value; if (typeof v === 'string') out.push(v); }));
    return out;
  };

  it('asosiy varaqda ichki ogohlantirish yo‘q (faqat «Замечания» xizmat varag‘ida); bir obyektda ПСД izohi, ko‘p obyektda yo‘q', async () => {
    const narxsizBarg = q({ tur: 'mat', kat: 'МАТ', nom: 'ДОПОЛНИТЕЛЬНАЯ', smeta_summa: null });
    const bir = ikkiObyekt()[0];
    bir.manba = { ...bir.manba, nakopitelniy: [{ ...bir.manba.nakopitelniy[0], qatorlar: [...bir.manba.nakopitelniy[0].qatorlar, narxsizBarg] }] };
    const h1 = forma3ShartnomaHujjat([bir], { davr: '2026-03', shartnomaRaqam: 'T-1' });
    const wb1 = await varaqlar(h1.bytes);
    const asosiy1 = matnlar(wb1.worksheets[0]).join('\n');
    expect(asosiy1).not.toMatch(/Внимание|без цены|ТРЕБУЮЩИЕ ВНИМАНИЯ/);
    expect(asosiy1).toContain('определяется после разработки ПСД');
    const zam = wb1.worksheets.find((w) => /Замечания/.test(w.name));
    expect(zam).toBeTruthy();
    expect(matnlar(zam!).join('\n')).toMatch(/нет стоимости по смете|без цены/);
    const h2 = forma3ShartnomaHujjat(ikkiObyekt(), { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: 'T-1' });
    expect(matnlar((await varaqlar(h2.bytes)).worksheets[0]).join('\n')).not.toContain('ПСД');
  });

  it('asosiy varaq muzlatilmaydi (22 qatorli titul ekranni egallamasin)', async () => {
    const h = forma3ShartnomaHujjat(ikkiObyekt(), { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: 'T-1' });
    const wb = await varaqlar(h.bytes);
    expect(wb.worksheets[0].views?.[0]?.state ?? 'normal').not.toBe('frozen');
  });

  it('«Договор №5 (01.02.2026)» — sana ikki marta chiqmaydi; shartnoma nomidagi «(joriy: …)» belgisi hujjatga o‘tmaydi', async () => {
    const h = forma3ShartnomaHujjat(ikkiObyekt(), { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: '№5 (01.02.2026)', shartnomaNom: 'Obyekt (joriy: DS 1/1 01.02.2026)', shartnomaSumma: 1_000_000 });
    const t = matnlar((await varaqlar(h.bytes)).worksheets[0]).join('\n');
    expect(t).toContain('№ 5 от 01.02.2026 г.');
    expect(t).not.toMatch(/\(01\.02\.2026\)/);
    expect(t).not.toContain('joriy');
    expect(t).toContain('Obyekt');
  });

  it('hujjat sanasi berilmasa — hisobot oyi chegarasida (o‘tgan oy F3 si bugungi sana bilan emas)', () => {
    expect(f3SanaOyIchida('2026-11-14', '2026-03')).toBe('2026-03-31');
    expect(f3SanaOyIchida('2026-01-05', '2026-03')).toBe('2026-03-01');
    expect(f3SanaOyIchida('2026-03-12', '2026-03')).toBe('2026-03-12');
    expect(f3SanaOyIchida('2026-11-14', 'xato')).toBe('2026-11-14');
    const h = forma3ShartnomaHujjat(ikkiObyekt(), { varaqRejim: 'bitta', davr: '2020-03', shartnomaRaqam: 'T-1' });
    expect(h.davr.oxiri).toBe('2020-03-31');
  });
});

describe('Forma 3 shartnoma — smeta qiymati va shartnoma summasi', () => {
  it('smeta (QQS bilan) shartnoma summasidan farq qilsa — xizmat varag‘ida ogohlantirish; teng bo‘lsa yo‘q', () => {
    const obs = ikkiObyekt();
    const smeta = f3ShartnomaYigish(obs, '2026-03').jami.G.vsego!;
    const farqli = forma3ShartnomaHujjat(obs, { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: 'T-1', shartnomaSumma: smeta + 5_000_000 });
    expect(farqli.diqqat.some((d) => d.nom === 'ИТОГО ПО ДОГОВОРУ' && /не равна общей стоимости договора/.test(d.sabab))).toBe(true);
    const teng = forma3ShartnomaHujjat(obs, { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: 'T-1', shartnomaSumma: smeta });
    expect(teng.diqqat.some((d) => /не равна общей стоимости договора/.test(d.sabab))).toBe(false);
  });
});

describe('Forma 3 shartnoma — etalon shakli: har obyekt alohida varaq, summa alohida katak, #,##0 va 0.0%', () => {
  const akt = (id: number, oy: string, u: number, ul: number, q: number): F3DavrAkt => ({ aktId: id, raqam: String(id), oy, hujjatPodvali: true, ustamasiz: u, ustamali: ul, qqs: q, qqsBilan: Math.round((ul + q) * 100) / 100 });
  async function yukla(bytes: Uint8Array) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    return wb;
  }
  const obs = () => { const o = ikkiObyekt(); const a = akt(12, '2026-03', 2_000_000, 2_300_000, 276_000); o[0] = { ...o[0], davrAktlari: [a], aktlarJami: [a] }; return o; };

  it('sukut: har obyekt alohida varaq + oxirida «ИТОГО ПО ДОГОВОРУ» jamlama varag‘i; bitta rejimda hammasi bitta varaqda', async () => {
    const h = forma3ShartnomaHujjat(obs(), { davr: '2026-03', shartnomaRaqam: 'T-1', shartnomaSumma: 30_000_000 });
    const nomlar = (await yukla(h.bytes)).worksheets.map((w) => w.name);
    expect(nomlar.slice(0, 2).every((n) => n.startsWith('СЧЁТ-ФАКТ. ('))).toBe(true);
    expect(nomlar[2]).toBe('ИТОГО ПО ДОГОВОРУ');
    const bitta = forma3ShartnomaHujjat(obs(), { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: 'T-1', shartnomaSumma: 30_000_000 });
    expect((await yukla(bitta.bytes)).worksheets[0].name).toBe('СЧЁТ-ФАКТ.');
    // Jamlama o'zgarmadi: oy to'lovi ikkala rejimda bir xil.
    expect(h.oyKOplate).toBe(bitta.oyKOplate);
  });

  it('shartnoma summasi alohida katakda (son, «сум» yonida); pul #,##0, foiz 0.0% — qiymat to‘liq saqlanadi', async () => {
    const h = forma3ShartnomaHujjat(obs(), { varaqRejim: 'bitta', davr: '2026-03', shartnomaRaqam: 'T-1', shartnomaSumma: 30_123_456.78 });
    const ws = (await yukla(h.bytes)).worksheets[0];
    let topildi = false; let fmt = ''; let foiz = '';
    ws.eachRow((row) => row.eachCell((c) => {
      if (typeof c.value === 'number' && Math.abs(c.value - 30_123_456.78) < 1e-6) { topildi = true; fmt = c.numFmt || fmt; }
      if (c.value && typeof c.value === 'object' && 'formula' in c.value && /IF\(N\(/.test(String(c.value.formula))) foiz = c.numFmt || foiz;
    }));
    expect(topildi).toBe(true);
    expect(fmt).toBe('#,##0');
    expect(foiz).toBe('0.0"%"');
    const matn: string[] = []; ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === 'string') matn.push(c.value); }));
    expect(matn.join('\n')).toContain('Общая договорная текущая стоимость');
    expect(matn.join('\n')).not.toMatch(/30 123 456/); // matn ichida emas — alohida katakda
  });
});

describe('Forma 3 (obyekt rejimi) — kumulyativ К ОПЛАТЕ aktlar o‘z podvali bilan', () => {
  it('aktlarJami berilsa: с начала / с начала года = aktlar ВСЕГО yig‘indisi (kaskad emas), farq xizmat ro‘yxatida', () => {
    const o = ikkiObyekt()[0];
    const mk = (id: number, oy: string, ul: number): F3DavrAkt => ({ aktId: id, raqam: String(id), oy, hujjatPodvali: true, ustamasiz: 1_000_000, ustamali: ul, qqs: 100_000, qqsBilan: ul + 100_000 });
    const eski = mk(5, '2025-12', 1_100_000), yangi = mk(12, '2026-03', 1_200_000);
    const h = forma3Hujjat(o.manba, { obyektNom: o.obyektNom, asosiyObyektId: o.obyekt_id, davr: '2026-03', nakrutka: o.nakrutka, davrAktlari: [yangi], aktlarJami: [eski, yangi] });
    expect(h.vsegoKOplate.H).toBe(1_200_000 + 100_000 + 1_100_000 + 100_000);
    expect(h.vsegoKOplate.I).toBe(1_300_000);
    expect(h.oyKOplate).toBe(1_300_000);
    expect(h.diqqat.some((d) => /С НАЧАЛА СТРОИТЕЛЬСТВА/.test(d.nom))).toBe(true);
    // aktlarJami berilmasa — eski xulq (kaskad)
    const eskiH = forma3Hujjat(o.manba, { obyektNom: o.obyektNom, asosiyObyektId: o.obyekt_id, davr: '2026-03', nakrutka: o.nakrutka });
    expect(eskiH.vsegoKOplate.H).not.toBe(h.vsegoKOplate.H);
  });
});