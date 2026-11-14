/**
 * Накопительная ведомость — tirik hujjat (egasi 2026-11-14): zamena/qo'shimcha/bajarilmadi o'z joyida belgisi bilan, har F-2 ustuni o'z podvali bilan,
 * tanada ustamali ustun yo'q, tirik formulalar (JS bilan qayta hisoblangan), svod bir marta, bekor F-2 faqat ma'lumot ilovasida.
 * Hamma ma'lumot SINTETIK.
 */
import { describe, expect, it } from 'vitest';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { nakopitelniyJamilar, nakopitelniyVedomostHujjat, type NakopitelniyAktMeta, type NakopitelniyOylar } from './nakopitelniy-vedomost-export';
import { f2AktUstunlari } from './nakopitelniy-akt-ustun';
import { hujjatTekshir } from './hujjat-yozuvchi';
import { formulalarniQaytaHisobla } from './hujjat-yozuvchi/test-formula';
import { bosKesim, f2Baholash, kesimgaQosh } from './hisob-yadro';
import type { F2Tafsilot } from '../api/t2-narx';

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

const NK_1 = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const NK_2 = { ...NK_1, ПРОЧИЕ_ПОДРЯДЧИК: 10, СТРАХОВАНИЕ: 0.5 };

/** Sintetik smeta: razdel → ish → [asl МАТ (qisman zamena), zamena МАТ, qo'shimcha МАТ, bajarilmadi ЧЕЛ]. */
function smeta() {
  const rz = q({ qator_id: 1, tur: 'rz', daraja: 0, ota_id: null, nom: 'РАЗДЕЛ А' });
  const bl = q({ qator_id: 2, tur: 'bl', daraja: 1, ota_id: 1, kod: 'Е-1', nom: 'РАБОТА', birlik: 'м3', smeta_hajm: 10 });
  const asl = q({ qator_id: 3, tur: 'mat', daraja: 2, ota_id: 2, kat: 'МАТ', kod: 'С-1', nom: 'ПЕСОК', birlik: 'м3', smeta_hajm: 10, smeta_narx: 1000, smeta_summa: 10_000, fakt_hajm: 6, almashtirilgan_hajm: 4, almashtirilgan_summa: 4_000 });
  const zam = q({ qator_id: 4, tur: 'mat', daraja: 2, ota_id: 2, kat: 'МАТ', kod: 'С-2', nom: 'ЩЕБЕНЬ', birlik: 'м3', zamena: true, almashtirgan_id: 3, smeta_hajm: 4, smeta_narx: 1200, smeta_summa: 4_800, fakt_hajm: 4 });
  const qosh = q({ qator_id: 5, tur: 'mat', daraja: 2, ota_id: 2, kat: 'МАТ', kod: 'С-3', nom: 'ЦЕМЕНТ', birlik: 'т', qoshimcha: true, smeta_hajm: 2, smeta_narx: 500, smeta_summa: 1_000, fakt_hajm: 2 });
  const bj = q({ qator_id: 6, tur: 'rs', daraja: 2, ota_id: 2, kat: 'ЧЕЛ', kod: '1-1', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'чел.-ч', smeta_hajm: 5, smeta_narx: 100, smeta_summa: 500, bajarilmadi_sabab: 'loyiha_ozgardi', bajarilmadi_hajm: 5 });
  return { rows: [rz, bl, asl, zam, qosh, bj], asl, zam, qosh, bj };
}

/** F-2 tafsilot qatori (sintetik). */
const taf = (akt_id: number, raqam: string, oy: string, qator_id: number, hajm: number, summa: number, holat = 'tasdiqlangan'): F2Tafsilot => ({
  akt_id, obyekt_id: 1, kompaniya_id: 1, tur: 'f2', oy: `${oy}-01`, akt_holat: holat, raqam, akt_kim: null, akt_sana: `${oy}-15`, akt_qator_id: akt_id * 100 + qator_id, qator_id,
  kod: null, nom: null, birlik: null, kat: null, qator_tur: null, hajm, narx: null, summa, izoh: null,
} as F2Tafsilot);

/** Aktning kutilgan ВСЕГО — mustaqil yadro hisobi (server modeli: o'z podvali, bitta blok). */
function kutilganVsego(nk: Record<string, number>, lines: Array<{ kat: string; summa: number }>): number {
  const k = bosKesim();
  for (const l of lines) kesimgaQosh(k, l.kat, l.summa);
  return f2Baholash([{ kalit: 'yangi', kesim: k, nk }], { podval: null, koef: null }).qqsBilan as number;
}

function aktlar(): { oylar: NakopitelniyOylar; vs1: number; vs2: number } {
  const rows = [
    taf(11, '5', '2026-08', 3, 2, 2_000), taf(11, '5', '2026-08', 5, 1, 500),
    taf(12, '6', '2026-09', 3, 1, 1_000), taf(12, '6', '2026-09', 4, 2, 2_400),
  ];
  const vs1 = kutilganVsego(NK_1, [{ kat: 'МАТ', summa: 2_000 }, { kat: 'МАТ', summa: 500 }]);
  const vs2 = kutilganVsego(NK_2, [{ kat: 'МАТ', summa: 1_000 }, { kat: 'МАТ', summa: 2_400 }]);
  const baho = [
    { aktId: 11, raqam: '5', hujjatPodvali: true, ustamasiz: 2_500, ustamali: null, qqs: null, qqsBilan: vs1, nk: NK_1, birlikSoni: 1 },
    { aktId: 12, raqam: '6', hujjatPodvali: true, ustamasiz: 3_400, ustamali: null, qqs: null, qqsBilan: vs2, nk: NK_2, birlikSoni: 1 },
  ];
  return { oylar: f2AktUstunlari(rows, '2026-09', baho, [{ aktId: 13, raqam: '7', oy: '2026-09' }, { aktId: 14, raqam: '6', oy: '2026-09', almashtirganId: 12 }]), vs1, vs2 };
}

const OPT = { obyektNom: 'Объект', davr: '2026-09', ndsFoiz: 12, nakrutka: NK_1 };
const hujjat = (rows: NakopitelniyQator[], oylar: NakopitelniyOylar | null, extra: Record<string, unknown> = {}) => nakopitelniyVedomostHujjat(rows, { ...OPT, oylar, ...extra });
const kataklar = (b: Uint8Array, i = 0) => hujjatTekshir(b).varaqlar[i].kataklar;
const qatorRef = (c: ReturnType<typeof kataklar>, matn: string) => c.find((k) => k.matn?.includes(matn))!.ref.replace(/^[A-Z]+/, '');

describe('nakopitelniy: zamena / qo‘shimcha / bajarilmadi — o‘z joyida, kelib chiqishi bilan', () => {
  const { rows } = smeta();
  const { oylar } = aktlar();
  const h = hujjat(rows, oylar);
  const c = kataklar(h.bytes);

  it('(a) zamena asl qator tagida: «ВЗАМЕН ПОЗ. N» va asl qatorda «ИСКЛЮЧАЕТСЯ / ЗАМЕНЕНО ПОЗ. M»; plyus/minus qatorlar', () => {
    const matn = (s: string) => c.find((k) => k.matn?.includes(s))?.matn ?? '';
    const asl = matn('ПЕСОК');
    const zam = matn('ЩЕБЕНЬ');
    expect(asl).toMatch(/ИСКЛЮЧАЕТСЯ \/ ЗАМЕНЕНО ПОЗ\. \d+/);
    expect(zam).toMatch(/ЗАМЕНА: ВЗАМЕН ПОЗ\. \d+/);
    const aslPoz = /ПОЗ\. (\d+)/.exec(zam)![1];
    const zamPoz = /ЗАМЕНЕНО ПОЗ\. (\d+)/.exec(asl)![1];
    // havolalar o'zaro mos: zamenaning «взамен» raqami = asl qatorning №, asl «заменено» raqami = zamena №.
    const noOf = (ref: string) => { const x = c.find((k) => k.ref === `A${qatorRef(c, ref)}`); return x?.matn ?? x?.v; };
    expect(String(noOf('ПЕСОК'))).toBe(aslPoz);
    expect(String(noOf('ЩЕБЕНЬ'))).toBe(zamPoz);
    // tartib: asl → minus (исключаемая часть) → zamena
    const rAsl = Number(qatorRef(c, 'ПЕСОК')), rMin = Number(qatorRef(c, 'ИСКЛЮЧАЕТСЯ ИЗ СМЕТЫ')), rZam = Number(qatorRef(c, 'ЩЕБЕНЬ'));
    expect(rAsl < rMin && rMin < rZam).toBe(true);
    // minus qator: smeta summasi manfiy (asl qismi), zamena — musbat
    expect(Number(c.find((k) => k.ref === `G${rMin}`)?.v)).toBe(-4_000);
    expect(Number(c.find((k) => k.ref === `G${rZam}`)?.v)).toBe(4_800);
    expect(matn('ЦЕМЕНТ')).toMatch(/ДОП\. РАБОТА/);
  });

  it('(7) bajarilmadi qatori yo‘qolmaydi: o‘z joyida «НЕ ВЫПОЛНЯЕТСЯ», smeta summasi ko‘rinadi, fakt 0, qoldiq formulasi to‘g‘ri', () => {
    const matn = c.find((k) => k.matn?.includes('ЗАТРАТЫ ТРУДА'))!.matn!;
    expect(matn).toMatch(/НЕ ВЫПОЛНЯЕТСЯ/);
    expect(matn).toMatch(/ИЗМЕНЕНИЕ ПРОЕКТА/i);
    const r = qatorRef(c, 'ЗАТРАТЫ ТРУДА');
    expect(Number(c.find((k) => k.ref === `G${r}`)?.v)).toBe(500);
    expect(Number(c.find((k) => k.ref === `H${r}`)?.v)).toBe(0);
    const ost = c.find((k) => k.ref === `${'Q'}${r}`);
    expect(ost?.f).toMatch(/^IF\(G\d+="","",G\d+-/);
    expect(Number(ost?.v)).toBe(500);
  });

  it('jamilar: smeta «после изменений» = asl + zamena + doplnitelnaya − istisno qilingan qism; hujjat ВСЕГО bilan bir xil', () => {
    const j = nakopitelniyJamilar(rows);
    expect(j.smeta).toBe(10_000 + 4_800 + 1_000 + 500 - 4_000);
    expect(h.jamilar).toEqual(j);
  });

  it('«Свод изменений» varag‘i: до → исключаемые → замена → доп. работы → после (SUMIFS formulalar), bekor F-2 ma‘lumot ilovasida', () => {
    const t = hujjatTekshir(h.bytes);
    expect(t.varaqlar.map((v) => v.nom)).toContain('Свод изменений');
    const s = t.varaqlar.find((v) => v.nom === 'Свод изменений')!.kataklar;
    const matn = s.map((k) => k.matn ?? '').join('\n');
    for (const x of ['СМЕТА ДО ИЗМЕНЕНИЙ', 'ИСКЛЮЧАЕМЫЕ ПОЗИЦИИ', 'ЗАМЕНА', 'ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ', 'СМЕТА ПОСЛЕ ИЗМЕНЕНИЙ', 'НЕ ВЫПОЛНЯЕТСЯ']) expect(matn).toContain(x);
    expect(s.filter((k) => /SUMIFS\(/.test(k.f ?? '')).length).toBeGreaterThanOrEqual(8);
    const posle = s.find((k) => k.matn === 'СМЕТА ПОСЛЕ ИЗМЕНЕНИЙ')!.ref.replace(/^[A-Z]+/, '');
    expect(Number(s.find((k) => k.ref === `B${posle}`)?.v)).toBe(h.jamilar.smeta);
    // bekor aktlar: jamiga kirmaydi, ilovada raqam va qaysi akt bilan almashtirilgani ko'rinadi
    expect(matn).toMatch(/АННУЛИРОВАННЫЕ АКТЫ/);
    expect(matn).toMatch(/Ф-2 № 7[^\n]*аннулирован/i);
    expect(matn).toMatch(/Ф-2 № 6[^\n]*аннулирован; заменён актом Ф-2 № 6/i);
  });

  it('bekor F-2 ustun emas va jamiga kirmaydi', () => {
    expect(oylar.aktlar!.map((a) => a.aktId)).toEqual([11, 12]);
    const r = qatorRef(c, 'ЩЕБЕНЬ');
    // с начала (Q) = faqat tasdiqlangan akt 12: 2 400
    expect(c.filter((k) => k.ref.endsWith(r) && Number(k.v) === 2_400).length).toBeGreaterThan(0);
  });
});

describe('nakopitelniy: har F-2 ustuni — o‘z podvali, tanada ustama yo‘q, tirik formulalar', () => {
  const { rows } = smeta();
  const { oylar, vs1, vs2 } = aktlar();
  const h = hujjat(rows, oylar);
  const t = hujjatTekshir(h.bytes);
  const c = t.varaqlar[0].kataklar;

  it('(d) tanada «К оплате» / ustamali ustun YO‘Q', () => {
    const matn = t.matnlar.join('\n');
    expect(matn).not.toMatch(/^К ОПЛАТЕ/m);
    expect(matn).not.toMatch(/с накруткой/i);
    // ustun sarlavhalari: faqat smeta/fakt/F-2/с начала/остаток/можно предъявить
    for (const x of ['ПО СМЕТЕ', 'ВЫПОЛНЕНО (ФАКТ)', 'Ф-2 № 5', 'Ф-2 № 6', 'ОТЧЕТНЫЙ ПЕРИОД', 'С НАЧАЛА СТРОИТЕЛЬСТВА', 'ОСТАТОК ПО СМЕТЕ']) expect(matn.toUpperCase()).toContain(x.toUpperCase());
  });

  it('(e) har akt podvali: ВСЕГО = yadro hisobi (server modeli) tiyingacha; nazorat qatori farqi 0', () => {
    const vsegoQatorlar = c.filter((k) => k.matn === 'ВСЕГО К ОПЛАТЕ (С НАКЛАДНЫМИ РАСХОДАМИ И НДС)');
    expect(vsegoQatorlar.length).toBeGreaterThanOrEqual(5); // smeta, fakt, 2 akt, ostatok
    const ktr = (col: string, raqam: string) => { const lab = c.find((z) => z.ref.startsWith('C') && new RegExp('ПОДПИСАННОМУ АКТУ Ф-2 № ' + raqam + ' ').test(z.matn ?? ''))!; return Number(c.find((z) => z.ref === col + lab.ref.slice(1))?.v); };
    // akt ustunlari: J/K (№ 5), L/M (№ 6)
    expect(h.kaskad!.K!.vsego, 'kaskadK').toBeCloseTo(vs1, 2);
    expect(h.kaskad!.M!.vsego, 'kaskadM').toBeCloseTo(vs2, 2);
    expect(ktr('K', '5'), 'ktrK').toBeCloseTo(vs1, 2);
    expect(ktr('M', '6'), 'ktrM').toBeCloseTo(vs2, 2);
    const farq = c.filter((k) => /Расхождение/.test(k.matn ?? '')).map((k) => c.find((z) => z.ref === `K${k.ref.replace(/^[A-Z]+/, '')}` || z.ref === `M${k.ref.replace(/^[A-Z]+/, '')}`)?.v);
    expect(farq.filter((x) => x != null).every((x) => Math.abs(Number(x)) < 0.005)).toBe(true);
    // akt podvallari har xil foiz (№ 6 da boshqa ПРОЧИЕ): ikki podval alohida
    expect(Math.abs(vs2 - kutilganVsego(NK_1, [{ kat: 'МАТ', summa: 1_000 }, { kat: 'МАТ', summa: 2_400 }]))).toBeGreaterThan(1);
  });

  it('«с начала» podvali = aktlar podvallari yig‘indisi (formula); kOplata.jami = Σ ВСЕГО aktlar, davr — hisobot oyi aktlari', () => {
    expect(h.kOplata.jami).toBeCloseTo(vs1 + vs2, 2);
    expect(h.kOplata.davr).toBeCloseTo(vs2, 2);
    const matn = t.matnlar.join('\n');
    expect(matn).toMatch(/ПОДВАЛ: С НАЧАЛА СТРОИТЕЛЬСТВА/);
    expect(c.some((k) => /^ROUND\([A-Z]+\d+\+[A-Z]+\d+,2\)$/.test(k.f ?? '') && Math.abs(Number(k.v) - (vs1 + vs2)) < 0.01)).toBe(true);
  });

  it('(c) har summa katagi tirik: smeta/fakt/с начала/остаток — formula; imzolangan F-2 katagi — qiymat (formula emas)', () => {
    const r = qatorRef(c, 'ЦЕМЕНТ');
    const cell = (col: string) => c.find((k) => k.ref === `${col}${r}`)!;
    expect(cell('G').f).toMatch(/ROUND\(E\d+\*F\d+,2\)/);        // smeta = hajm × narx
    expect(cell('I').f).toBe(`IF(OR(H${r}="",F${r}=""),"",ROUND(H${r}*F${r},2))`); // fakt = hajm × narx
    expect(cell('J').f ?? null).toBeNull(); expect(cell('K').f ?? null).toBeNull(); // akt hajmi/summasi — imzolangan qiymat
    expect(Number(cell('K').v)).toBe(500);
    expect(cell('O').f).toBe(`K${r}+M${r}`);                       // с начала summa
    expect(cell('Q').f).toMatch(/^IF\(G\d+="","",G\d+-O\d+\)$/);   // qoldiq = smeta − jami
    // razdel/ВСЕГО — SUMIF yig'indilar
    expect(c.filter((k) => k.matn === 'ВСЕГО ПО ОБЪЕКТУ').length).toBe(1);
    const vr = qatorRef(c, 'ВСЕГО ПО ОБЪЕКТУ');
    expect(c.find((k) => k.ref === `G${vr}`)?.f).toMatch(/^ROUND\(SUMIF\(T\d+:T\d+,1,G\d+:G\d+\),2\)$/);
  });

  it('formulalar JS bilan qayta hisoblandi: xato 0, keshdan farq 0 (Excel o‘zi ham shunday hisoblaydi)', () => {
    const r = formulalarniQaytaHisobla(h.bytes);
    expect(r.soni).toBeGreaterThan(100);
    expect(r.xato).toEqual([]);
    expect(r.farq).toEqual([]);
  });

  it('hajm o‘zgarsa hammasi qayta hisoblanadi: ish hajmi E ↔ resurs hajmi (norma × ish); fakt formulasi', () => {
    const rz = q({ qator_id: 41, tur: 'rz', daraja: 0, ota_id: null, nom: 'РАЗДЕЛ' });
    const bl = q({ qator_id: 42, tur: 'bl', daraja: 1, ota_id: 41, nom: 'ИШ', smeta_hajm: 100 });
    const rs = q({ qator_id: 43, tur: 'rs', daraja: 2, ota_id: 42, kat: 'ЧЕЛ', nom: 'ТРУД', birlik: 'чел.-ч', smeta_hajm: 200, smeta_narx: 5000, smeta_summa: 1_000_000, norma: 2, fakt_hajm: 10 });
    const r = formulalarniQaytaHisobla(hujjat([rz, bl, rs], null).bytes);
    expect(r.xato).toEqual([]);
    expect(r.farq).toEqual([]);
  });
});

describe('nakopitelniy: svod (yaxlit) bo‘lim bir marta sanaladi', () => {
  it('(b) jami = qatorlar + svod BIR MARTA: ВСЕГО ПО ОБЪЕКТУ smeta = svod summasi; podvalda alohida «по своду» qatori, ikki marta emas', () => {
    const rz = q({ qator_id: 61, tur: 'rz', daraja: 0, ota_id: null, nom: 'БАРЕЛЬЕФ (СВОД)' });
    const bl = q({ qator_id: 62, tur: 'bl', daraja: 1, ota_id: 61, nom: 'РАБОТА' });
    const m1 = q({ qator_id: 63, tur: 'mat', daraja: 2, ota_id: 62, kat: 'МАТ', nom: 'МАТЕРИАЛ 1', birlik: 'м3', smeta_hajm: 10, smeta_narx: 1000, smeta_summa: 10_000 });
    const m2 = q({ qator_id: 64, tur: 'mat', daraja: 2, ota_id: 62, kat: 'МАТ', nom: 'МАТЕРИАЛ 2', birlik: 'м3', smeta_hajm: 10, smeta_narx: 1000, smeta_summa: 10_000 });
    const oddiy = q({ qator_id: 65, tur: 'mat', daraja: 2, ota_id: 62, kat: 'МАТ', nom: 'ОБЫЧНЫЙ', birlik: 'м3', smeta_hajm: 1, smeta_narx: 3_000, smeta_summa: 3_000 });
    // 61-razdel ichidagi barglar svod: qqssiz 20 000 (bitta summa). Oddiy barg ham shu razdelda — svodga kiradi.
    const svodYaxlit = { qqssiz: 20_000, barglar: 23_000, summasiz: 0, bolimlar: [{ id: 1, qator_id: 61, nom: 'БАРЕЛЬЕФ (СВОД)', svod_summa: 22_400, qqs_stavka: 12, qqssiz: 20_000, barglar: 23_000, asos: 'svod' as const, dalil: {} }] };
    const h = nakopitelniyVedomostHujjat([rz, bl, m1, m2, oddiy], { ...OPT, svodYaxlit });
    const c = kataklar(h.bytes);
    const vr = qatorRef(c, 'ВСЕГО ПО ОБЪЕКТУ');
    expect(Number(c.find((k) => k.ref === `G${vr}`)?.v)).toBe(20_000);                     // svod bir marta
    const razdel = qatorRef(c, 'ИТОГО ПО РАЗДЕЛУ');
    expect(Number(c.find((k) => k.ref === `G${razdel}`)?.v)).toBe(20_000);                  // tepada va pastda takror emas
    const podval = hujjatTekshir(h.bytes).matnlar.filter((m) => /по своду целой суммой|Свод яхлит|СВОД/i.test(m) && !/БАРЕЛЬЕФ/.test(m));
    expect(podval.length).toBeGreaterThan(0);
    expect(formulalarniQaytaHisobla(h.bytes).farq).toEqual([]);
  });
});

describe('nakopitelniy: imzolangan akt podvali — qiymat, aynan ko‘chiriladi', () => {
  it('o‘z podval qatorlari berilsa: foiz ko‘rinadi, summa — imzolangan QIYMAT (formula emas), ВСЕГО aynan; «с начала» — formula', () => {
    const { rows } = smeta();
    const { oylar } = aktlar();
    const imzo = [
      { kod: 'pryamye', nom: 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', foiz: null, summa: 2_500 },
      { kod: 'itogo4', nom: 'ИТОГО', foiz: null, summa: 3_000.11 },
      { kod: 'nds', nom: 'НДС', foiz: 12, summa: 360.01 },
      { kod: 'vsego', nom: 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА', foiz: null, summa: 3_360.12 },
    ];
    const buzuq: NakopitelniyOylar = { ...oylar, aktlar: oylar.aktlar!.map((a: NakopitelniyAktMeta) => (a.aktId === 11 ? { ...a, podvalQatorlar: imzo } : a)) };
    const h = hujjat(rows, buzuq);
    const c = kataklar(h.bytes);
    const vr = c.find((k) => k.ref.startsWith('C') && k.matn === 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА')!.ref.slice(1);
    const cell = c.find((k) => k.ref === `K${vr}`)!;
    expect(Number(cell.v)).toBe(3_360.12);
    expect(cell.f ?? null).toBeNull();
    const ndsRow = c.find((k) => k.ref.startsWith('C') && k.matn === 'НДС')!.ref.slice(1);
    expect(Number(c.find((k) => k.ref === `F${ndsRow}`)?.v)).toBe(12);
    expect(h.kaskad!.K!.vsego).toBe(3_360.12);
    // nazorat: ustun jami (2 500) − imzolangan «прямые» (2 500) = 0
    expect(formulalarniQaytaHisobla(h.bytes).farq).toEqual([]);
    expect(h.kOplata.jami).toBeCloseTo(3_360.12 + aktlar().vs2, 2);
    // «с начала» ВСЕГО — aktlar ВСЕГО yig'indisi formulasi
    expect(c.some((k) => /^ROUND\(K\d+\+M\d+,2\)$/.test(k.f ?? ''))).toBe(true);
  });
});

describe('nakopitelniy: eski chaqiruvlar buzilmaydi', () => {
  it('oylar/aktlar bo‘lmasa — «принято ранее / за период», bitta umumiy podval; «К ОПЛАТЕ» ustunlari yo‘q', () => {
    const { rows } = smeta();
    const h = nakopitelniyVedomostHujjat(rows, OPT);
    expect(hujjatTekshir(h.bytes).matnlar.join('\n')).toContain('ПРИНЯТО РАНЕЕ');
    expect(formulalarniQaytaHisobla(h.bytes).xato).toEqual([]);
  });

  it('ВСЕГО aktlar imzolangan summadan farq qilsa — замечание (jim emas), nazorat qatorida farq ko‘rinadi', () => {
    const { rows } = smeta();
    const { oylar } = aktlar();
    const buzuq: NakopitelniyOylar = { ...oylar, aktlar: oylar.aktlar!.map((a: NakopitelniyAktMeta) => (a.aktId === 11 ? { ...a, qqsBilan: (a.qqsBilan ?? 0) + 10 } : a)) };
    const h = hujjat(rows, buzuq);
    const t = hujjatTekshir(h.bytes);
    expect(t.matnlar.some((m) => /отличается от подписанного акта/.test(m))).toBe(true);
  });
});
