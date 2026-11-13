/**
 * Shartnoma darajasidagi СПРАВКА-СЧЕТ-ФАКТУРА — egasining REAL hujjatidagi SHAKL (2026-11-13: «real hujjatdagidek bo'lsin»).
 * Bu test real namunaning TUZILISHINI qotiradi: 16 grafa sarlavhasi, obyekt = bitta blok (ish ro'yxatisiz), davr «с» = oldingi
 * F-3 sanasi, imzo tartibi (avval ЗАКАЗЧИК), taqiqlangan matn yo'qligi, rekvizit qatorlari, narastayushchiy formula.
 * Faqat SINTETIK ma'lumot: real summa, nom, INN YO'Q.
 */
import { describe, expect, it } from 'vitest';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import {
  F3_BOSH_JOY, F3_REAL_SARLAVHA_KATAKLAR, F3_SARLAVHA, F3_VARAQ_NOMI, f3RealDavr, f3RekvizitQatorlari,
  forma3Hujjat, forma3ShartnomaHujjat, forma3SotuvdanXlsx,
  type Forma3Manba, type Forma3ShartnomaObyekt, type Forma3ShartnomaOptions,
} from './forma3-export';
import { f3OldingiSana } from './forma3-shartnoma';
import { hujjatTekshir, type TekshirVaraq } from './hujjat-yozuvchi';
type TekshirKatak = TekshirVaraq['kataklar'][number];
import type { SvodShartnoma } from './nakopitelniy-svod';
import { unzipSync, strFromU8 } from 'fflate';

let seq = 5000;
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
const NK = { 'ТРАНСПОРТ_МАТЕРИАЛ': 5, 'СКЛАДСКИЕ_МАТЕРИАЛ': 2, 'СКЛАДСКИЕ_МК': 2, 'ТРАНСПОРТ_КАБЕЛЬ': 3, 'ПРОЧИЕ_ПОДРЯДЧИК': 10, 'ТРАНСПОРТ_ОБОРУД': 4, 'ЗАГОТ_СКЛАД_ОБОРУД': 1.5, 'СТРАХОВАНИЕ': 1, 'РИСК': 0, 'НДС': 12 };

/** Sintetik obyekt: razdel → ish → bitta material bargi; F2 oylik summalari. */
function obyekt(id: number, nom: string, smeta: number, f2: Array<[string, number]>): Forma3ShartnomaObyekt {
  const rz = q({ tur: 'rz', nom: 'РАЗДЕЛ СИНОВ' });
  const bl = q({ tur: 'bl', kod: 'Е01', nom: 'СИНОВ ИШИ', birlik: 'м3', smeta_summa: smeta });
  const barg = q({ tur: 'mat', kat: 'МАТ', kod: 'С1', nom: 'СИНОВ МАТЕРИАЛИ', birlik: 'м3', smeta_summa: smeta });
  const manba: Forma3Manba = {
    nakopitelniy: [{ obyekt_id: id, obyektNom: nom, qatorlar: [rz, bl, barg] }],
    f2Oylik: f2.map(([oy, summa], i) => ({ obyekt_id: id, qator_id: barg.qator_id, oy, summa, akt_id: id * 100 + i })),
  };
  return { obyekt_id: id, obyektNom: nom, manba, nakrutka: NK };
}
const ikki = (): Forma3ShartnomaObyekt[] => [
  obyekt(1, 'Sinov obyekti A', 10_000_000, [['2026-02', 1_000_000], ['2026-03', 2_000_000], ['2026-04', 500_000]]),
  obyekt(2, 'Sinov obyekti B', 20_000_000, [['2026-03', 4_000_000], ['2026-04', 1_500_000]]),
];
const OPT: Forma3ShartnomaOptions = {
  davr: '2026-03', shartnomaRaqam: 'T-1', shartnomaNom: 'Sinov shartnomasi', shartnomaSana: '2026-01-15', shartnomaSumma: 33_600_000,
  raqam: '2', hujjatSana: '2026-04-05', oldingiF3Sana: '2026-03-07',
};

type Varaq = { kataklar: Map<string, TekshirKatak>; merges: Set<string>; nom: string };
function och(bytes: Uint8Array): Varaq {
  const t = hujjatTekshir(bytes, {});
  const v = t.varaqlar[0];
  const xml = strFromU8(unzipSync(bytes)[v.yol]);
  return { nom: v.nom, kataklar: new Map(v.kataklar.map((k) => [k.ref, k])), merges: new Set([...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => m[1])) };
}
const matn = (k: TekshirKatak | undefined): string => String(k?.matn ?? k?.v ?? '');
const son = (k: TekshirKatak | undefined): number | null => (k?.v == null || k.v === '' ? null : Number(k.v));
/** Matni aynan teng birinchi katak manzili. */
const top = (v: Varaq, m: string): string => {
  for (const [ref, k] of v.kataklar) if (matn(k) === m) return ref;
  throw new Error(`katak topilmadi: ${m}`);
};
const qatorOf = (ref: string) => Number(/\d+$/.exec(ref)![0]);
const ustunOf = (ref: string) => /^[A-Z]+/.exec(ref)![0];
const HARFLAR = 'ABCDEFGHIJKLMNOP'.split('');

describe('Forma 3 (shartnoma) — real hujjat shakli', () => {
  const h = forma3ShartnomaHujjat(ikki(), OPT);
  const v = och(h.bytes);
  const hammaMatn = [...v.kataklar.values()].map(matn);

  it('sarlavha: «СПРАВКА-СЧЕТ-ФАКТУРА …» va oy qatori; «Форма № 3» / «Форма одобрена» matni HECH QAYERDA yo‘q', () => {
    expect(matn(v.kataklar.get('A1'))).toBe(F3_SARLAVHA);
    expect(matn(v.kataklar.get('A2'))).toBe('ЗА МАРТ МЕСЯЦ 2026 ГОДА');
    expect(v.merges.has('A1:P1')).toBe(true);
    expect(v.nom).toBe(F3_VARAQ_NOMI);
    const t = hujjatTekshir(h.bytes, {});
    const hammasi = [...t.matnlar, ...t.varaqlar.map((x) => x.nom)].join(' | ');
    for (const taqiq of [/форма\s*№\s*3/i, /форма одобрена/i, /ПО ДОГОВОРУ \(С УЧЕТОМ/, /Справка составлена по договору/]) expect(hammasi).not.toMatch(taqiq);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
  });

  it('jadval sarlavhasi: 16 grafa, ikki qavat, real birlashmalar, 1..16 raqamlash', () => {
    const r0 = qatorOf(top(v, '№'));
    // 1-qavat: № | Наименование | Ед. изм. (vertikal birlashgan) + 5 guruh; 2-qavat: 13 ost-sarlavha.
    const kutilgan = new Map<string, string>();
    for (const k of F3_REAL_SARLAVHA_KATAKLAR) kutilgan.set(`${HARFLAR[k.c1]}${r0 + k.qator}`, k.matn);
    expect(kutilgan.size).toBe(8 + 13);
    for (const [ref, m] of kutilgan) expect(matn(v.kataklar.get(ref)), ref).toBe(m);
    for (const m of [`A${r0}:A${r0 + 1}`, `B${r0}:B${r0 + 1}`, `C${r0}:C${r0 + 1}`, `D${r0}:E${r0}`, `F${r0}:G${r0}`, `H${r0}:J${r0}`, `K${r0}:M${r0}`, `N${r0}:P${r0}`]) expect(v.merges.has(m), m).toBe(true);
    expect(HARFLAR.map((L) => matn(v.kataklar.get(`${L}${r0 + 2}`)))).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
    // 17-ustun yo'q: hujjat A..P bilan tugaydi (yashirin texnik ustunsiz).
    expect([...v.kataklar.keys()].some((ref) => !HARFLAR.includes(ustunOf(ref)))).toBe(false);
    expect(matn(v.kataklar.get(`H${r0}`))).toBe('С начала проведения работ');
    expect(matn(v.kataklar.get(`K${r0}`))).toBe('С начала года');
    expect(matn(v.kataklar.get(`N${r0}`))).toBe('в т.ч. за отчётный месяц');
  });

  it('har obyekt — BITTA blok: nom qatori (A:P birlashgan) + QQS siz / НДС / ВСЕГО; ish va resurs qatorlari yo‘q', () => {
    for (const [i, nom] of [[1, 'SINOV OBYEKTI A'], [2, 'SINOV OBYEKTI B']] as const) {
      const r = qatorOf(top(v, `${i}. ${nom}`));
      expect(v.merges.has(`A${r}:P${r}`)).toBe(true);
      expect([1, 2, 3].map((k) => matn(v.kataklar.get(`A${r + k}`)))).toEqual([`${i}.1`, `${i}.2`, `${i}.3`]);
      expect([1, 2, 3].map((k) => matn(v.kataklar.get(`B${r + k}`)))).toEqual(['ИТОГО ЗАТРАТЫ ПО ОБЪЕКТАМ', 'НДС 12%', 'ВСЕГО ПО ПОДОБЪЕКТУ']);
      // Har obyekt nomi hujjat jadvalida aynan bir marta (bitta blok).
      expect(hammaMatn.filter((m) => m === `${i}. ${nom}`)).toHaveLength(1);
    }
    expect(hammaMatn.filter((m) => m === 'ВСЕГО ПО ПОДОБЪЕКТУ')).toHaveLength(2);
    expect(hammaMatn.filter((m) => m === 'ВСЕГО ПО ОБЪЕКТУ')).toHaveLength(1);
    const rj = qatorOf(top(v, '3. ИТОГО ПО ОБЪЕКТУ'));
    expect([1, 2, 3].map((k) => matn(v.kataklar.get(`B${rj + k}`)))).toEqual(['ИТОГО ЗАТРАТЫ ПО ОБЪЕКТАМ', 'НДС 12%', 'ВСЕГО ПО ОБЪЕКТУ']);
    // Ish ro'yxati (razdel / ish / material) hujjatga chiqmaydi.
    for (const m of hammaMatn) expect(m).not.toMatch(/РАЗДЕЛ СИНОВ|СИНОВ ИШИ|СИНОВ МАТЕРИАЛИ|ИТОГО ПРЯМЫЕ/);
  });

  it('summalar yadrodan aynan: obyekt qatori = yig‘indi natijasi, jami = obyektlar yig‘indisi (jonli SUM), гр.7 = гр.6', () => {
    const y = h.yigindi;
    y.obyektlar.forEach((ob, i) => {
      const r = qatorOf(top(v, `${i + 1}. ${ob.nom.toUpperCase()}`));
      const ustunlar = [['F', 'G'], ['J', 'H'], ['M', 'I'], ['P', 'J']] as const;
      for (const [L, c] of ustunlar) {
        expect(son(v.kataklar.get(`${L}${r + 1}`))).toBe(ob.ustun[c].itogo4);
        expect(son(v.kataklar.get(`${L}${r + 2}`))).toBe(ob.ustun[c].qqs);
        expect(son(v.kataklar.get(`${L}${r + 3}`))).toBe(ob.ustun[c].vsego);
        expect(v.kataklar.get(`${L}${r + 3}`)?.f).toBe(`${L}${r + 1}+${L}${r + 2}`);
      }
      expect(v.kataklar.get(`G${r + 3}`)?.f).toBe(`F${r + 3}`);
      // Bajarilish foizi faqat ВСЕГО qatorida (гр.9, 12, 15), QQS bilan summalar nisbati.
      expect(son(v.kataklar.get(`I${r + 3}`))).toBeCloseTo((ob.ustun.H.vsego! / ob.ustun.G.vsego!) * 100, 2);
      expect(matn(v.kataklar.get(`I${r + 1}`))).toBe('');
    });
    const rj = qatorOf(top(v, '3. ИТОГО ПО ОБЪЕКТУ'));
    expect(son(v.kataklar.get(`P${rj + 3}`))).toBe(y.jami.J.vsego);
    expect(son(v.kataklar.get(`J${rj + 1}`))).toBe(y.jami.H.itogo4);
    expect(v.kataklar.get(`P${rj + 1}`)?.f).toMatch(/^SUM\(|^P\d+\+P\d+$/);
    expect(h.oyKOplate).toBe(y.jami.J.vsego);
  });

  it('«Отчетный период»: «с» = OLDINGI F-3 sanasi (oy boshi emas), «по» = hujjat sanasi; quti real joyida (E:F, G:H, J:M)', () => {
    const r = qatorOf(top(v, 'Номер документа'));
    expect(top(v, 'Номер документа')).toBe(`E${r}`);
    expect(top(v, 'Дата составления')).toBe(`G${r}`);
    expect(top(v, 'Отчетный период')).toBe(`J${r}`);
    for (const m of [`E${r}:F${r}`, `G${r}:H${r}`, `J${r}:M${r}`, `J${r + 1}:K${r + 1}`, `L${r + 1}:M${r + 1}`]) expect(v.merges.has(m), m).toBe(true);
    expect([matn(v.kataklar.get(`J${r + 1}`)), matn(v.kataklar.get(`L${r + 1}`))]).toEqual(['с', 'по']);
    expect(matn(v.kataklar.get(`E${r + 2}`))).toBe('2');
    expect(matn(v.kataklar.get(`G${r + 2}`))).toBe('05.04.2026 г.');
    expect(matn(v.kataklar.get(`J${r + 2}`))).toBe('07.03.2026 г.'); // oldingi F-3 sanasi, «01.03.2026» EMAS
    expect(matn(v.kataklar.get(`L${r + 2}`))).toBe('05.04.2026 г.');
    expect(h.davr).toEqual({ boshi: '2026-03-07', oxiri: '2026-04-05' });
  });

  it('davr qoidasi: oldingi F-3 yo‘q — shartnoma sanasi; u ham yo‘q — oy boshi; «с» hech qachon «по» dan keyin emas', () => {
    expect(f3RealDavr({ hujjatSana: '2026-04-05', oldingiF3Sana: '2026-03-07', shartnomaSana: '2026-01-15', davr: '2026-03' }).boshi).toBe('2026-03-07');
    expect(f3RealDavr({ hujjatSana: '2026-04-05', oldingiF3Sana: null, shartnomaSana: '2026-01-15', davr: '2026-03' }).boshi).toBe('2026-01-15');
    expect(f3RealDavr({ hujjatSana: '2026-04-05', davr: '2026-03' }).boshi).toBe('2026-03-01');
    expect(f3RealDavr({ hujjatSana: '2026-02-20', oldingiF3Sana: '2026-03-07', davr: '2026-03' })).toEqual({ boshi: '2026-02-20', oxiri: '2026-02-20' });
    // Panel yordamchisi: hisobot davri boshidan oldin tugagan, bekor qilinmagan F-3 lar ichidan eng kechkisi.
    const f3lar = [{ davr_oxiri: '2026-01-31', holat: 'tasdiqlangan' }, { davr_oxiri: '2026-02-28', holat: null }, { davr_oxiri: '2026-02-28', holat: 'bekor' }, { davr_oxiri: '2026-03-31', holat: null }];
    expect(f3OldingiSana(f3lar, '2026-03-01')).toBe('2026-02-28');
    expect(f3OldingiSana([{ davr_oxiri: '2026-02-27', holat: 'bekor' }], '2026-03-01')).toBeNull();
    expect(f3OldingiSana([], '2026-03-01')).toBeNull();
  });

  it('imzo: AVVAL (chapda) ЗАКАЗЧИК, keyin (o‘ngda) ПОДРЯДЧИК; Директор va Гл. бухгалтер har ikki tomonda', () => {
    const z = top(v, 'ЗАКАЗЧИК'), p = top(v, 'ПОДРЯДЧИК');
    expect(qatorOf(z)).toBe(qatorOf(p));
    expect(ustunOf(z)).toBe('B');
    expect(ustunOf(p)).toBe('J');
    const rd = qatorOf(z) + 2;
    for (const L of ['B', 'J']) {
      expect(matn(v.kataklar.get(`${L}${rd}`))).toMatch(/^Директор: _+/);
      expect(matn(v.kataklar.get(`${L}${rd + 2}`))).toMatch(/^Гл\. бухгалтер: _+/);
    }
    // Imzo jadval va oy jamidan keyin.
    expect(qatorOf(z)).toBeGreaterThan(qatorOf(top(v, 'ВСЕГО ПО ОБЪЕКТУ')));
  });

  it('rekvizit: 8 qator HAMMASI chiqadi — bori qiymat bilan, yo‘g‘i to‘ldirish chizig‘i («—» emas)', () => {
    // Hech narsa berilmagan: telefon/bank/OKED ham chiziq bilan chiqadi.
    for (const yorliq of ['Подрядчик:', 'Адрес:', 'Телефон:', 'р/с:', 'Банк:', 'МФО:', 'ИНН:', 'ОКЭД:']) {
      const ref = top(v, yorliq);
      const r = qatorOf(ref);
      const qiymatlar = [...v.kataklar.entries()].filter(([x, k]) => qatorOf(x) === r && matn(k) && !/:$/.test(matn(k))).map(([, k]) => matn(k));
      expect(qiymatlar, yorliq).toEqual([F3_BOSH_JOY, F3_BOSH_JOY]);
    }
    expect(hammaMatn.some((m) => m === '—' || m === '-')).toBe(false);
    // Berilgan maydon — qiymat bilan; berilmagani — chiziq.
    const q2 = f3RekvizitQatorlari({ toliqNom: 'Sinov pudratchi MChJ', telefon: '00 000-00-00', bank: 'Sinov bank' }, { toliqNom: 'Sinov buyurtmachi', oked: '00000' });
    expect(q2.map((x) => x[0])).toEqual(['Подрядчик:', 'Адрес:', 'Телефон:', 'р/с:', 'Банк:', 'МФО:', 'ИНН:', 'ОКЭД:']);
    expect(q2[0]).toEqual(['Подрядчик:', 'Sinov pudratchi MChJ', 'Заказчик:', 'Sinov buyurtmachi']);
    expect(q2[2]).toEqual(['Телефон:', '00 000-00-00', 'Телефон:', F3_BOSH_JOY]);
    expect(q2[4]).toEqual(['Банк:', 'Sinov bank', 'Банк:', F3_BOSH_JOY]);
    expect(q2[7]).toEqual(['ОКЭД:', F3_BOSH_JOY, 'ОКЭД:', '00000']);
    const tola = och(forma3ShartnomaHujjat(ikki(), { ...OPT, pudratchi: { toliqNom: 'Sinov pudratchi MChJ', telefon: '00 000-00-00', rahbar: 'S. Sinovov' }, zakazchik: { toliqNom: 'Sinov buyurtmachi', bank: 'Sinov bank', boshHisobchi: 'B. Hisobchiyev' } }).bytes);
    const tm = [...tola.kataklar.values()].map(matn);
    for (const m of ['Sinov pudratchi MChJ', '00 000-00-00', 'Sinov buyurtmachi', 'Sinov bank']) expect(tm).toContain(m);
    expect(matn(tola.kataklar.get(`J${qatorOf(top(tola, 'ПОДРЯДЧИК')) + 2}`))).toMatch(/^Директор: _+ S\. Sinovov$/);
    expect(matn(tola.kataklar.get(`B${qatorOf(top(tola, 'ЗАКАЗЧИК')) + 4}`))).toMatch(/^Гл\. бухгалтер: _+ B\. Hisobchiyev$/);
  });

  it('obyekt va shartnoma qatori: «Наименование объекта и его адрес», «Договор № … от … Общая договорная текущая стоимость»', () => {
    const ro = qatorOf(top(v, 'Наименование объекта и его адрес:'));
    expect(hammaMatn).toContain('Sinov shartnomasi');
    expect(qatorOf(top(v, 'Sinov shartnomasi'))).toBe(ro);
    const d = hammaMatn.find((m) => m.startsWith('№ T-1'))!;
    expect(d).toMatch(/^№ T-1 от 15\.01\.2026 г\. Общая договорная текущая стоимость: 33[\s ]600[\s ]000,00 сум$/);
  });

  it('narastayushchiy: ketma-ket F-3 larda гр.10 (с начала) = oldingi F-3 гр.10 + shu F-3 гр.16 (за месяц); гр.13 ham', () => {
    const oylar = ['2026-02', '2026-03', '2026-04'];
    const jami = oylar.map((davr) => {
      const x = och(forma3ShartnomaHujjat(ikki(), { ...OPT, davr, hujjatSana: `${davr}-28`, oldingiF3Sana: null }).bytes);
      const r = qatorOf(top(x, 'ВСЕГО ПО ОБЪЕКТУ'));
      return { J: son(x.kataklar.get(`J${r}`))!, M: son(x.kataklar.get(`M${r}`))!, P: son(x.kataklar.get(`P${r}`))! };
    });
    // Birinchi F-3: с начала = с начала года = за месяц.
    expect(jami[0].J).toBeCloseTo(jami[0].P, 2);
    expect(jami[0].M).toBeCloseTo(jami[0].P, 2);
    for (let i = 1; i < jami.length; i++) {
      expect(jami[i].J).toBeCloseTo(jami[i - 1].J + jami[i].P, 2);
      expect(jami[i].M).toBeCloseTo(jami[i - 1].M + jami[i].P, 2);
      expect(jami[i].P).toBeGreaterThan(0);
    }
  });

  it('bir obyektli shartnoma: raqamlashsiz bitta blok, «ВСЕГО ПО ОБЪЕКТУ», alohida jami bloki yo‘q (real bir obyektli hujjat)', () => {
    const x = och(forma3ShartnomaHujjat([ikki()[0]], OPT).bytes);
    const m = [...x.kataklar.values()].map(matn);
    const r = qatorOf(top(x, 'SINOV OBYEKTI A'));
    expect(x.merges.has(`A${r}:P${r}`)).toBe(true);
    expect([1, 2, 3].map((k) => matn(x.kataklar.get(`B${r + k}`)))).toEqual(['ИТОГО ЗАТРАТЫ ПО ОБЪЕКТАМ', 'НДС 12%', 'ВСЕГО ПО ОБЪЕКТУ']);
    expect([1, 2, 3].map((k) => matn(x.kataklar.get(`A${r + k}`)))).toEqual(['', '', '']);
    expect(m.some((s) => /ИТОГО ПО ОБЪЕКТУ$/.test(s) && s !== 'ВСЕГО ПО ОБЪЕКТУ')).toBe(false);
    expect(m).not.toContain('ВСЕГО ПО ПОДОБЪЕКТУ');
  });

  it('NULL ≠ 0: nakrutkasi yo‘q obyekt — kataklari bo‘sh, shartnoma jami ham bo‘sh (0 yozilmaydi), sababi hujjatda', () => {
    const obs = ikki();
    obs[1] = { ...obs[1], nakrutka: null };
    const hh = forma3ShartnomaHujjat(obs, OPT);
    const x = och(hh.bytes);
    const rb = qatorOf(top(x, '2. SINOV OBYEKTI B'));
    const rj = qatorOf(top(x, '3. ИТОГО ПО ОБЪЕКТУ'));
    for (const r of [rb + 1, rb + 2, rb + 3, rj + 1, rj + 2, rj + 3]) for (const L of ['F', 'J', 'M', 'P']) expect(matn(x.kataklar.get(`${L}${r}`)), `${L}${r}`).toBe('');
    expect(son(x.kataklar.get(`P${qatorOf(top(x, '1. SINOV OBYEKTI A')) + 3}`))).toBeGreaterThan(0);
    expect(hh.oyKOplate).toBeNull();
    expect(hh.propis).toBeNull();
    expect([...x.kataklar.values()].map(matn).some((s) => /ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ/.test(s))).toBe(true);
  });
});

describe('Forma 3 (sotuv summasidan, shartnoma darajasi) — real hujjat shakli', () => {
  const sh: SvodShartnoma = {
    id: 1, loyiha_id: 1, raqam: 'T-1', nom: 'Sinov', asosiy: true, holat: 'faol', jami_nds_bilan: 5_600_000,
    obyektlar: [{ id: 10, nom: 'Sinov obyekti A' }], ds: [], f2: [], tolovlar: [],
    f3: [
      { id: 11, manba: 'sotuv', raqam: '1', sotuv_sana: '2026-02-10', sotuv_summa: 1_120_000, nds_foiz: 12, davr_boshi: '2026-02-10', davr_oxiri: '2026-02-10', holat: 'qoralama', bajarilgan_f2_summa: null, izoh: null, versiya: 1 },
      { id: 12, manba: 'sotuv', raqam: '2', sotuv_sana: '2026-03-12', sotuv_summa: 2_240_000, nds_foiz: 12, davr_boshi: '2026-03-12', davr_oxiri: '2026-03-12', holat: 'qoralama', bajarilgan_f2_summa: null, izoh: null, versiya: 1 },
    ],
  };
  const x = och(forma3SotuvdanXlsx(sh, 12, { tashkilot: 'Sinov MChJ' })!.bytes);
  const m = [...x.kataklar.values()].map(matn);

  it('16 grafa, bitta blok, «с» = oldingi F-3 (sotuv) sanasi, imzo tartibi, taqiqlangan matn yo‘q', () => {
    expect(matn(x.kataklar.get('A1'))).toBe(F3_SARLAVHA);
    expect(matn(x.kataklar.get('A2'))).toBe('ЗА МАРТ МЕСЯЦ 2026 ГОДА');
    const r0 = qatorOf(top(x, '№'));
    expect(HARFLAR.map((L) => matn(x.kataklar.get(`${L}${r0 + 2}`)))).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
    const rq = qatorOf(top(x, 'Номер документа'));
    expect(matn(x.kataklar.get(`J${rq + 2}`))).toBe('10.02.2026 г.');
    expect(matn(x.kataklar.get(`L${rq + 2}`))).toBe('12.03.2026 г.');
    const r = qatorOf(top(x, 'SINOV OBYEKTI A'));
    expect([1, 2, 3].map((k) => matn(x.kataklar.get(`B${r + k}`)))).toEqual(['ИТОГО ЗАТРАТЫ ПО ОБЪЕКТАМ', 'НДС 12%', 'ВСЕГО ПО ОБЪЕКТУ']);
    // ВСЕГО: гр.6 shartnoma summasi, гр.10 с начала (1-chi + 2-chi sotuv), гр.16 shu sotuv.
    expect([son(x.kataklar.get(`F${r + 3}`)), son(x.kataklar.get(`J${r + 3}`)), son(x.kataklar.get(`P${r + 3}`))]).toEqual([5_600_000, 3_360_000, 2_240_000]);
    expect(son(x.kataklar.get(`P${r + 1}`))).toBe(2_000_000);
    expect(son(x.kataklar.get(`P${r + 2}`))).toBe(240_000);
    expect(ustunOf(top(x, 'ЗАКАЗЧИК'))).toBe('B');
    expect(ustunOf(top(x, 'ПОДРЯДЧИК'))).toBe('J');
    for (const s of m) expect(s).not.toMatch(/форма\s*№\s*3|форма одобрена/i);
    expect(x.nom).toBe(F3_VARAQ_NOMI);
  });
});

describe('Forma 3 (obyekt rejimi) — real hujjatga mos umumiy qismlar', () => {
  it('«Форма одобрена» yo‘q, varaq nomi «СЧЁТ-ФАКТ.», imzoda ЗАКАЗЧИК ПОДРЯДЧИКdan oldin, rekvizit 8 qator', () => {
    const o = ikki()[0];
    const hh = forma3Hujjat(o.manba, { obyektNom: o.obyektNom, asosiyObyektId: 1, davr: '2026-03', nakrutka: NK, raqam: '1', hujjatSana: '2026-03-28' });
    const t = hujjatTekshir(hh.bytes, {});
    expect(t.varaqlar[0].nom).toBe(F3_VARAQ_NOMI);
    const hammasi = t.matnlar.join(' | ');
    expect(hammasi).not.toMatch(/форма одобрена|форма\s*№\s*3/i);
    for (const yorliq of ['Телефон:', 'Банк:', 'ОКЭД:']) expect(hammasi).toContain(yorliq);
    const x = och(hh.bytes);
    const z = [...x.kataklar.entries()].find(([, k]) => /^ЗАКАЗЧИК:/.test(matn(k)))![0];
    const p = [...x.kataklar.entries()].find(([, k]) => /^ПОДРЯДЧИК:/.test(matn(k)))![0];
    expect(qatorOf(z)).toBeLessThan(qatorOf(p));
  });
});
