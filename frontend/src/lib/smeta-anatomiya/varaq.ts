import { IerarxiyaQuruvchi } from './ierarxiya';
import { bosh, kalit, son, toliqUstunlar, xom } from './matn';
import { sarlavhaBlokiniTop, tartibRaqamlariQatorimi, ustunXaritasi, type SarlavhaBloki } from './ustun';
import { qoshimchaUstunlar, uchlikniMoslashtir } from './ustun-dalil';
import { varaqProfili } from './profil';
import type {
  Dalil, Ish, Katak, KirishVaraq, Manzil, Resurs, UstunXaritasi, VaraqAnatomiyasi, VaraqRoli,
} from './turlar';

const IMZO = /^(СОСТАВИЛ|ПРОВЕРИЛ|TUZDI|TEKSHIRDI|ИСПОЛНИТЕЛЬ)/;
/** F2/akt imzo bloki (ЗАКАЗЧИК / Представитель Тех.надзора / ПОДРЯДЧИК / Производитель
 *  работ / (Дата.Подп) / Директор / Гл. бухгалтер) — faqat sonsiz, 1–2 katakli qatorda:
 *  bundan keyin ma'lumot yo'q. Sarlavha sifatida o'qilmasin. */
const AKT_IMZO = /^(ЗАКАЗЧИК|ПОДРЯДЧИК|ПРЕДСТАВИТЕЛЬ|ПРОИЗВОДИТЕЛЬ РАБОТ|ДИРЕКТОР|ГЛ\.? ?БУХГАЛТЕР|\(ДАТА)/;
const JAMI = /^(ИТОГО|ВСЕГО|JAMI|ЖАМИ|ПРЯМЫЕ ЗАТРАТЫ\s*[—–-]\s*ВСЕГО)/;
/** Jamiga tegishli hisob qatorlari: resurs emas, lekin o'z summasi bilan saqlanadi. */
const HISOB_QATORI = /^(В Т\.? ?Ч\.?|В ТОМ ЧИСЛЕ|ТРАНСПОРТНЫЕ РАСХОДЫ|ЗАГОТОВИТЕЛЬНО|СКЛАДСКИЕ РАСХОДЫ)/;
/** F2 yakuniy hisob/podval satrlari — matching daraxti qatori emas, lekin review'da saqlanadi. */
const F2_PODVAL_QATORI = /^(ПРЯМЫЕ ЗАТРАТЫ\s*:|ПРОЧИЕ РАСХОДЫ ПОДРЯДЧИКА|СТРАХОВАНИЕ ОБЪЕКТА|РИСК\s*,?\s*%|НДС\s*,?\s*%|КОЭФФИЦИЕНТ К ОПЛАТЕ\s*:)/i;
/** Ish daraxtini yopadi: bundan keyin resurs vedomosti, sarlavha emas. */
const VEDOMOST_BOSHI = /^(ВЕДОМОСТЬ РЕСУРСОВ|ТРУДОВЫЕ РЕСУРСЫ|ЗАТРАТЫ ТРУДА$|(СТРОИТЕЛЬНЫЕ )?МАШИНЫ И МЕХАНИЗМЫ|МАТЕРИАЛЬНЫЕ РЕСУРСЫ|СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ)/;

function butunTartib(v: Katak): boolean {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0;
  return /^\d+$/.test(xom(v));
}
function ichkiTartib(v: Katak): boolean {
  if (typeof v === 'number') return Number.isFinite(v) && !Number.isInteger(v) && v > 0;
  return /^\d+\.\d+$/.test(xom(v));
}
function ol(row: readonly Katak[], i: number): Katak {
  return i >= 0 ? row[i] : null;
}

/** Tizim1/LRV_PLUS texnik "tur" ustuni qiymatlari (rz/bl/rs/mat/ob, "+" qo'shimcha, "~" zamena). */
const TUR_BELGI = /^(rz|bl|rs|mat|ob)[+~]?$/i;
type TexnikTur = 'rz' | 'bl' | 'rs' | 'mat' | 'ob';
const RESURS_KATEGORIYALARI = new Set(['ЧЕЛ', 'МАШ', 'МАТ']);
function texnikTurniOqi(v: Katak): { tur: TexnikTur; belgi: string } | null {
  const belgi = xom(v).trim().toLowerCase();
  const m = belgi.match(TUR_BELGI);
  return m ? { tur: m[1] as TexnikTur, belgi } : null;
}
/**
 * Texnik tur ustuni (Tizim1 LRV_PLUS eksportlari: I ustun = rz/bl/rs/mat/ob) — ma'lumotdan:
 * to'ldirilgan kataklarning ≥ 90 % i shu belgilar va kamida 10 ta. Bo'lsa, `rz` qatori
 * (nomida 0 sonlari bo'lsa ham) razdel sarlavhasi (egasi 2026-09-28: "razdellar yo'q").
 */
function turUstuniniTop(rows: readonly Katak[][], bosh: number): number {
  const hisob = new Map<number, { mos: number; jami: number }>();
  for (let r = bosh; r < Math.min(rows.length, bosh + 3000); r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v !== 'string' || !v.trim()) continue;
      const h = hisob.get(c) ?? { mos: 0, jami: 0 };
      h.jami++;
      if (TUR_BELGI.test(v.trim())) h.mos++;
      hisob.set(c, h);
    }
  }
  let eng = -1, engMos = 0;
  for (const [c, h] of hisob) if (h.mos >= 10 && h.mos / h.jami >= 0.9 && h.mos > engMos) { eng = c; engMos = h.mos; }
  return eng;
}

/** LRV_PLUS eksportidagi aniq `ТИП` ustuni: nom dalili + qator qiymatlaridan tekshiriladi. */
function lrvPlusTurUstuniniTop(rows: readonly Katak[][], blok: SarlavhaBloki | null): number {
  if (!blok) return -1;
  const ustun = blok.sarlavhalar.findIndex((s) => /^(ТИП|TIP|TUR)$/.test(kalit(s)));
  if (ustun < 0) return -1;
  let jami = 0, mos = 0;
  const turlar = new Set<TexnikTur>();
  for (let r = blok.malumotBoshi; r < Math.min(rows.length, blok.malumotBoshi + 3000); r++) {
    const qiymat = rows[r]?.[ustun];
    if (typeof qiymat !== 'string' || !qiymat.trim()) continue;
    jami++;
    const tur = texnikTurniOqi(qiymat);
    if (tur) { mos++; turlar.add(tur.tur); }
  }
  // Kamida bir necha real satr va BL bilan birga RZ/resurs turi bo'lmasa, sarlavha
  // tasodifiy “ТИП” bo'lishi mumkin. Noma'lum formatni avtomatik LRV deb olmaymiz.
  return jami >= 3 && mos / jami >= 0.85 && turlar.has('bl') && [...turlar].some((t) => t !== 'bl') ? ustun : -1;
}

/** Eski F2 dagi `Кат.` ustuni resurs turini tartib raqamisiz ham bevosita belgilaydi. */
function resursKategoriyaUstuniniTop(headers: readonly string[]): number {
  return headers.findIndex((header) => /^(КАТ\.?|КАТЕГОРИЯ|RESOURCE CATEGORY|TUR RESURS)$/.test(kalit(header)));
}

function resursKategoriyaAniq(row: readonly Katak[], ustun: number): boolean {
  if (ustun < 0) return false;
  // Hozirgi real F2 korpusida hujjatning `Кат.` ustunida aynan shu sinflar bor.
  // Yangi kategoriya faqat dalilli korpus/test bilan qo'shiladi.
  return RESURS_KATEGORIYALARI.has(kalit(row[ustun]).replace(/\.$/, ''));
}

/**
 * Norma (birlikka) ustuni sarlavhasi topilmaganda — MA'LUMOTDAN isbotlab topadi.
 * Holat (egasi, 2026-09-28, Fast food F2): Tizim1 LRV_PLUS eksporti "Количество: на
 * единицу | всего" sarlavhasini 0 bilan yozgan; ish (bl) hajmi E da, resurs E = norma,
 * F = E(ish) × E(resurs). Qoida: miqdor ustunidan chapdagi ustun uchun resurslarning
 * kamida 80 % ida (≥ 5 namuna) `miqdor ≈ ish qiymati × resurs qiymati` bajarilsa —
 * bu ustun norma/ish hajmi ustuni. Taxmin emas: tekshirilgan arifmetik dalil.
 * Ichki tartib Excelda son (96.1) yoki matn ("96.1") bo'lishi mumkin — ikkalasi ham.
 */
function normaUstuniniMalumotdanTop(rows: readonly Katak[][], u: UstunXaritasi): { ustun: number; izoh: string } | null {
  if (u.hajmBirlikka >= 0 || u.hajmLoyiha < 1 || u.tartib < 0) return null;
  const c = u.hajmLoyiha - 1;
  if ([u.tartib, u.shifr, u.nom, u.birlik, u.narx, u.summa].includes(c)) return null;
  let ishQ: number | null = null;
  let namuna = 0, mos = 0;
  for (const row of rows) {
    const t = ol(row, u.tartib);
    if (butunTartib(t)) { ishQ = son(ol(row, c)); continue; }
    if (!ichkiTartib(t) || ishQ == null) continue;
    const e = son(ol(row, c)), f = son(ol(row, u.hajmLoyiha));
    if (e == null || f == null || f === 0) continue;
    namuna++;
    if (Math.abs(ishQ * e - f) <= Math.max(Math.abs(f) * 0.005, 1e-6)) mos++;
  }
  if (namuna < 5 || mos / namuna < 0.8) return null;
  return { ustun: c, izoh: `norma ustuni sarlavhasiz, ma'lumotdan isbotlandi: ${mos}/${namuna} resursda miqdor = ish hajmi × norma` };
}
function matnYoki(row: readonly Katak[], i: number): string | null {
  const t = xom(ol(row, i));
  return t || null;
}

// ─── Rol ─────────────────────────────────────────────────────────────────────

function rolAniqla(nom: string, blok: SarlavhaBloki | null, rows: readonly Katak[][]): { rol: VaraqRoli; dalil: Dalil[] } {
  const n = kalit(nom);
  const sarlavha = blok ? blok.sarlavhalar.join(' | ') : '';
  const dalil: Dalil[] = [];
  if (lrvPlusTurUstuniniTop(rows, blok) >= 0) {
    return { rol: 'lrv', dalil: [...dalil, { qoida: 'lrv_plus:tip_va_qator_turlari', ishonch: 'yuqori', izoh: 'ТИП ustuni BL hamda RZ/resurs turlarini qatorlardan tasdiqladi' }] };
  }
  const nomLrv = /(^|_)(LRV|БВ|ЛРВ|F5)/.test(n);
  const nomRes = /(^|_)(RES|БР|РС)(_A)?$/.test(n);
  if (nomLrv) dalil.push({ qoida: 'varaq_nomi', ishonch: 'orta', izoh: `nomi "${nom}" — LRV belgisi` });
  if (nomRes) dalil.push({ qoida: 'varaq_nomi', ishonch: 'orta', izoh: `nomi "${nom}" — RES belgisi` });

  if (/ДАЛЬНОСТ|ГРУЗООБОРОТ|Т ?\/? ?КМ/.test(sarlavha)) {
    return { rol: 'transport', dalil: [...dalil, { qoida: 'sarlavha', ishonch: 'yuqori', izoh: 'tn·km / dalnost ustunlari' }] };
  }
  if (/РАБОТ|ISH VA RESURS/.test(sarlavha)) {
    return { rol: 'lrv', dalil: [...dalil, { qoida: 'sarlavha', ishonch: 'yuqori', izoh: 'nom ustuni: ishlar va resurslar' }] };
  }
  if (/ЗАТРАТ|ОБЪЕКТОВ И СМЕТ/.test(sarlavha) || /СВОД|^ФОРМА$/.test(n)) {
    return { rol: 'svod', dalil: [...dalil, { qoida: 'sarlavha', ishonch: 'yuqori', izoh: 'svod: xarajat moddalari' }] };
  }
  if (blok && /КОЛ|MIQDOR/.test(sarlavha) && /ЦЕНА|СТОИМ|СУММА|NARX/.test(sarlavha)) {
    return { rol: 'res', dalil: [...dalil, { qoida: 'sarlavha', ishonch: nomRes || /РЕСУРС/.test(sarlavha) ? 'yuqori' : 'orta', izoh: 'nom + miqdor + narx ustunlari' }] };
  }
  const sonli = rows.reduce((acc, row) => acc + row.filter((v) => typeof v === 'number').length, 0);
  if (sonli >= 3) return { rol: 'erkin', dalil: [...dalil, { qoida: 'shakl', ishonch: 'orta', izoh: "sonlar bor, lekin ma'lum smeta shakli topilmadi" }] };
  return { rol: 'bosh', dalil };
}

// ─── Titul ───────────────────────────────────────────────────────────────────

interface Titul { qurilish?: TitulQism; obyekt?: TitulQism; lokal?: TitulQism; yigma: boolean }
interface TitulQism { xom: string; qator: number; belgi: string | null }

/** Katak matnining "PREFIKS:" dan keyingi qismi — asl satrdan kesib olinadi, o'zgartirilmaydi. */
function prefiksdanKeyin(t: string, prefiks: RegExp): string | null {
  const m = t.match(prefiks);
  if (!m || m.index == null) return null;
  const qolgan = t.slice(m.index + m[0].length).trim();
  return qolgan || null;
}

function engUzunMatn(row: readonly Katak[]): string {
  let eng = '';
  for (const v of row) {
    const t = xom(v);
    if (typeof v !== 'number' && t.length > eng.length) eng = t;
  }
  return eng;
}

function titulOqi(rows: readonly Katak[][], oxir: number): Titul {
  const t: Titul = { yigma: false };
  for (let r = 0; r < oxir; r++) {
    const row = rows[r] ?? [];
    for (const v of row) {
      const s = xom(v);
      if (!s) continue;
      const k = kalit(s);
      const q = prefiksdanKeyin(s, /НАИМЕНОВАНИЕ СТРОЙКИ\s*:/i) ?? prefiksdanKeyin(s, /QURILISH NOMI\s*:/i);
      if (q) t.qurilish = { xom: q, qator: r, belgi: null };
      const o = prefiksdanKeyin(s, /НАИМЕНОВАНИЕ ОБЪЕКТА\s*:/i) ?? prefiksdanKeyin(s, /OBYEKT NOMI\s*:/i);
      if (o) t.obyekt = { xom: o, qator: r, belgi: null };
      // "(наименование стройки)" / "(наименование работ …, наименование объекта)" —
      // nom yuqoridagi qatorda turadi (Faravon/TN shakli).
      if (/^\(НАИМЕНОВАНИЕ СТРОЙКИ\)$/.test(k) && r > 0) {
        const yuqori = engUzunMatn(rows[r - 1] ?? []);
        if (yuqori) t.qurilish = { xom: yuqori, qator: r - 1, belgi: null };
      }
      if (/^\(НАИМЕНОВАНИЕ РАБОТ/.test(k) && r > 0) {
        const yuqori = engUzunMatn(rows[r - 1] ?? []);
        if (yuqori) t.lokal = { xom: yuqori, qator: r - 1, belgi: t.lokal?.belgi ?? null };
      }
      if (/^(СВОДНАЯ|ОБЪЕКТНАЯ) ЛОКАЛЬНАЯ/.test(k)) {
        t.yigma = true;
        const keyingi = engUzunMatn(rows[r + 1] ?? []);
        const ob = keyingi ? prefiksdanKeyin(keyingi, /ПО ДАННЫМ ЛОКАЛЬНЫХ СМЕТ НА/i) : null;
        if (ob && /^ОБЪЕКТНАЯ/.test(k)) t.obyekt = { xom: ob, qator: r + 1, belgi: null };
      } else if (/^(ЛОКАЛЬНАЯ .*(СМЕТА|ВЕДОМОСТЬ)|LOKAL .*BAYONOTI)/.test(k)) {
        const raqam = k.match(/№\s*(\S+)/);
        const belgi = raqam ? `№ ${raqam[1]}` : null;
        const keyingi = engUzunMatn(rows[r + 1] ?? []);
        if (keyingi && !/^\(/.test(keyingi) && !t.lokal) {
          t.lokal = { xom: prefiksdanKeyin(keyingi, /^НА\s+/i) ?? keyingi, qator: r + 1, belgi };
        } else if (t.lokal) {
          t.lokal.belgi = belgi;
        } else if (belgi) {
          t.lokal = { xom: s, qator: r, belgi };
        }
      }
    }
  }
  return t;
}

// ─── Qatorlar ────────────────────────────────────────────────────────────────

export function varaqniTahlilQil(fayl: string, varaq: KirishVaraq, sarlavhaBoshId = 1): VaraqAnatomiyasi {
  const rows = varaq.rows;
  const blok = sarlavhaBlokiniTop(rows);
  const aniqlangan = rolAniqla(varaq.nom, blok, rows);
  let rol = aniqlangan.rol;
  const rolDalil = aniqlangan.dalil;
  const u: UstunXaritasi | null = blok ? ustunXaritasi(blok) : null;
  // Tartib ustuni sarlavhasiz bo'lsa (real F2: "№" katagi bo'sh, raqamlash B dan) —
  // shifrdan chapdagi ustunda tartib raqamlari (1, 1.1, 2 …) bo'lsa, o'sha tartib.
  if (u && u.tartib < 0 && u.shifr > 0) {
    const c = u.shifr - 1;
    const namuna = rows.slice(u.malumotBoshi, u.malumotBoshi + 300).map((row) => row[c]).filter((v) => !bosh(v));
    const tartibli = namuna.filter((v) => butunTartib(v) || ichkiTartib(v)).length;
    if (tartibli >= 3 && tartibli >= namuna.length * 0.6) u.tartib = c;
  }
  // ABC4 "БР" (resurs smeta) sarlavhasi "БВ" (vedomost) bilan bir xil — rolni
  // ma'lumot shakli hal qiladi: ichki "1.1" qatorlar yo'q va ma'lumot resurs
  // guruhi bilan boshlansa — bu resurs ro'yxati.
  if (rol === 'lrv' && u) {
    const malumot = rows.slice(u.malumotBoshi, u.malumotBoshi + 2000);
    const ichkiBor = malumot.some((row) => ichkiTartib(ol(row, u.tartib)));
    // Birinchi 5 ta to'liq qatordan biri resurs guruhi bo'lsa (oldida titul izohi bo'lishi mumkin).
    const boshlari = malumot.filter((row) => toliqUstunlar(row).length).slice(0, 5);
    const guruhBilan = boshlari.some((row) => VEDOMOST_BOSHI.test(kalit(row[toliqUstunlar(row)[0]])));
    // TN titul: "ВЕДОМОСТЬ ПОТРЕБНЫХ РЕСУРСОВ" — RES hujjatining o'z nomi
    // (Hermes/codex 7ed860f tahlilidan). Faqat ichki qatorlar yo'q bo'lsa.
    const titulMatn = rows.slice(0, u.sarlavhaQatori).flatMap((row) => row.map(kalit)).join(' ');
    const potrebnyh = /ВЕДОМОСТ.{0,30}ПОТРЕБН.{0,30}РЕСУРС/.test(titulMatn);
    if (!ichkiBor && (guruhBilan || potrebnyh)) {
      rol = 'res';
      rolDalil.push(potrebnyh
        ? { qoida: 'titul', ishonch: 'yuqori', izoh: 'titul: ведомость потребных ресурсов, ichki (1.1) qatorlar yo‘q' }
        : { qoida: 'malumot_shakli', ishonch: 'yuqori', izoh: "ichki (1.1) qatorlar yo'q, resurs guruhi bilan boshlanadi — resurs ro'yxati" });
    }
  }
  const manzil = (r: number, c?: number): Manzil => ({ fayl, varaq: varaq.nom, qator: r + 1, ...(c != null && c >= 0 ? { ustun: c + 1 } : {}) });
  // PTO qo'shgan/o'zgartirgan ustunlarga moslashish: hajm/narx/summa uchligi
  // ma'lumot bilan isbotlanadi (hajm × narx ≈ summa); tanilmagan ustunlar ro'yxati.
  let qoshimcha: VaraqAnatomiyasi['qoshimchaUstunlar'];
  if (u && blok && (rol === 'lrv' || rol === 'res')) {
    const band = new Set([u.tartib, u.shifr, u.nom, u.birlik, u.hajmBirlikka].filter((i) => i >= 0));
    const m = uchlikniMoslashtir(blok.sarlavhalar, rows.slice(u.malumotBoshi, u.malumotBoshi + 2000), { hajm: u.hajmLoyiha, narx: u.narx, summa: u.summa }, band);
    if (m.qoida === 'arifmetika') {
      u.hajmLoyiha = m.uchlik.hajm; u.narx = m.uchlik.narx; u.summa = m.uchlik.summa;
    }
    rolDalil.push({ qoida: `ustunlar:${m.qoida}`, ishonch: m.ishonch, izoh: m.izoh });
    const nb = normaUstuniniMalumotdanTop(rows.slice(u.malumotBoshi, u.malumotBoshi + 3000), u);
    if (nb) {
      u.hajmBirlikka = nb.ustun;
      band.add(nb.ustun);
      rolDalil.push({ qoida: 'ustunlar:norma_arifmetika', ishonch: 'yuqori', izoh: nb.izoh });
    }
    qoshimcha = qoshimchaUstunlar(blok.sarlavhalar, new Set([...band, u.hajmLoyiha, u.narx, u.summa]));
  }
  const natija: VaraqAnatomiyasi = {
    fayl, varaq: varaq.nom, rol, rolDalil, ustunlar: u,
    titul: [], sarlavhalar: [], ishlar: [], vedomost: [], jamilar: [], review: [],
    ...(qoshimcha?.length ? { qoshimchaUstunlar: qoshimcha } : {}),
  };
  if (blok) natija.profil = varaqProfili(natija, blok.sarlavhalar, rows.slice(0, blok.bosh).flatMap((row) => row.map((c) => String(c ?? ''))).join(' ').toUpperCase());
  if (!u || !blok || (rol !== 'lrv' && rol !== 'res')) return natija;

  const titul = titulOqi(rows, blok.bosh);
  const iq = new IerarxiyaQuruvchi(sarlavhaBoshId);
  if (rol === 'lrv') {
    if (titul.obyekt) natija.titul.push(iq.ildizQosh(titul.obyekt.xom, 'obyekt', manzil(titul.obyekt.qator), 'titul: obyekt nomi'));
    if (titul.lokal && !titul.yigma) {
      const s = iq.ildizQosh(titul.lokal.xom, 'lokal', manzil(titul.lokal.qator), 'titul: lokal smeta nomi');
      s.belgi = titul.lokal.belgi;
      natija.titul.push(s);
    }
  }

  const review = (kod: string, izoh: string, r?: number) => natija.review.push({ kod, izoh, ...(r != null ? { manzil: manzil(r) } : {}) });
  const jamiQiymatiniOl = (row: readonly Katak[], r: number): { qiymat: number | null; ustun: number } => {
    const belgilangan = son(ol(row, u.summa));
    if (belgilangan != null) return { qiymat: belgilangan, ustun: u.summa };

    // Some LRV_PLUS/F2 exports keep explicit subtotal/total values in the last
    // numeric amount cell immediately beside an empty mapped SUM column. Use it
    // only when the total label is explicit and exactly one numeric candidate
    // exists to the right of the unit-price column; never derive a missing total.
    const raqamli = row.flatMap((cell, ustun) =>
      ustun >= Math.max(0, u.narx) && typeof cell === 'number' && Number.isFinite(cell)
        ? [{ qiymat: cell, ustun }]
        : []);
    if (raqamli.length === 1) {
      review('jami_summa_ustun_fallback', 'Hujjat jami summasi standart summa ustunida emas; yagona sonli qiymat olindi, manbadagi katakni tekshiring', r);
      return raqamli[0];
    }
    if (raqamli.length > 1) {
      review('jami_summa_ustun_noaniq', 'Jami qatorida standart summa ustuni bo‘sh va bir nechta sonli qiymat bor; jami taxmin qilinmadi', r);
    } else {
      review('jami_summa_yoq', 'Jami qatorining standart summa katagida qiymat yo‘q; jami boshqa qatorlardan hisoblab to‘ldirilmadi', r);
    }
    return { qiymat: null, ustun: u.summa };
  };
  let joriyIsh: Ish | null = null;
  let vedomostRejimi = rol === 'res';
  let guruh: string | null = null;

  const resursOl = (row: readonly Katak[], r: number, vedomost: boolean, marker?: string | null): Resurs => {
    const e = son(ol(row, u.hajmBirlikka));
    const f = son(ol(row, u.hajmLoyiha));
    const narx = son(ol(row, u.narx));
    const summa = son(ol(row, u.summa));
    // Tizim1 LRV_PLUS: normasiz material (masalan «ВЕТРО-ВЛАГОЗАЩИТНОЕ МЕМБРАНА», «С …»)
    // miqdori E da, F bo'sh. Faqat arifmetik ISBOT bilan: E × narx ≈ summa — shunda E miqdor,
    // norma emas. Isbot bo'lmasa miqdor bo'sh qoladi (NULL ≠ 0, o'ylab to'qilmaydi).
    const eMiqdor = !vedomost && f == null && e != null && narx != null && summa != null && summa !== 0
      && Math.abs(e * narx - summa) <= Math.max(Math.abs(summa) * 0.005, 0.5);
    return {
      tartib: xom(ol(row, u.tartib)),
      kod: matnYoki(row, u.shifr),
      xom: xom(ol(row, u.nom)),
      birlik: matnYoki(row, u.birlik),
      normaBirlikka: vedomost || eMiqdor ? null : e,
      hajm: vedomost ? (f ?? e) : eMiqdor ? e : f,
      narx,
      summa,
      guruh,
      ...(marker ? { texnikBelgi: marker } : {}),
      sarlavha: vedomost ? null : iq.joriy,
      manzil: manzil(r, u.nom),
    };
  };

  /** Sarlavha shakli: tartib raqami yo'q, sonli miqdor/narx/summa yo'q, matn bilan boshlanadi. */
  const sarlavhaShakli = (row: readonly Katak[]): boolean => {
    const toliq = toliqUstunlar(row);
    if (!toliq.length || typeof row[toliq[0]] === 'number') return false;
    const bk = kalit(row[toliq[0]]);
    if (IMZO.test(bk) || JAMI.test(bk) || HISOB_QATORI.test(bk) || JAMI.test(kalit(ol(row, u.nom)))) return false;
    if (VEDOMOST_BOSHI.test(bk)) return false;
    const t = ol(row, u.tartib);
    if (butunTartib(t) || ichkiTartib(t)) return false;
    return ![u.hajmBirlikka, u.hajmLoyiha, u.narx, u.summa].some((c) => c >= 0 && son(row[c]) != null);
  };

  const lrvPlusTurUstun = lrvPlusTurUstuniniTop(rows, blok);
  const turUstun = lrvPlusTurUstun >= 0 ? lrvPlusTurUstun : turUstuniniTop(rows, u.malumotBoshi);
  const resursKategoriyaUstun = resursKategoriyaUstuniniTop(blok.sarlavhalar);
  const qatorTexnikTuri = (row: readonly Katak[]) => turUstun >= 0 ? texnikTurniOqi(row[turUstun]) : null;
  const rzSarlavhaOl = (row: readonly Katak[]): { xom: string; ustun: number } | null => {
    const mosMatn = (ustun: number): { xom: string; ustun: number } | null => {
      const qiymat = ol(row, ustun);
      if (typeof qiymat !== 'string') return null;
      const matn = qiymat.trim();
      if (!matn || !/[A-Za-zА-ЯЁа-яё]/.test(matn) || texnikTurniOqi(matn)) return null;
      const k = kalit(matn);
      if (JAMI.test(k) || HISOB_QATORI.test(k) || IMZO.test(k) || VEDOMOST_BOSHI.test(k)) return null;
      // Marker ustuni bo'sh nom ustunini almashtirishi mumkin, lekin kodni
      // sarlavha deb ko'rsatmaymiz. Qisqa haqiqiy nomlar (masalan, "ПОЛ" yoki
      // "АР") RZ markerida saqlanadi; ular taxmin bilan kengaytirilmaydi.
      if (/^[A-ZА-ЯЁ]{1,5}\d[A-ZА-ЯЁ0-9./_-]*$/i.test(matn)) return null;
      return { xom: matn, ustun };
    };

    const tanlanganNom = mosMatn(u.nom);
    if (tanlanganNom) return tanlanganNom;

    // T1 LRV_PLUS skeleti markerli RZ uchun avval nom ustunini, keyin A:H
    // ma'lumot qismini ko'rardi. T2 shu fallbackni faqat aniqlangan markerdan
    // keyingi hujayralargacha qo'llaydi: o'ngdagi project/projection ustunlari
    // birinchi bola ish nomini RZ sarlavhasi deb yutib yubormaydi.
    const chegara = turUstun >= 0 ? turUstun : row.length;
    const nomzodlar: Array<{ xom: string; ustun: number }> = [];
    for (let c = 0; c < chegara; c++) {
      const nomzod = mosMatn(c);
      if (nomzod) nomzodlar.push(nomzod);
    }
    return nomzodlar.sort((a, b) => b.xom.length - a.xom.length || a.ustun - b.ustun)[0] ?? null;
  };
  const rzQatormi = (row: readonly Katak[]) => qatorTexnikTuri(row)?.tur === 'rz' && rzSarlavhaOl(row) != null;
  const ishYarat = (row: readonly Katak[], r: number, marker?: string | null): Ish => {
    const hajmL = son(ol(row, u.hajmLoyiha));
    const ish: Ish = {
      tartib: xom(ol(row, u.tartib)),
      shifr: matnYoki(row, u.shifr),
      xom: xom(ol(row, u.nom)),
      birlik: matnYoki(row, u.birlik),
      hajm: hajmL ?? son(ol(row, u.hajmBirlikka)),
      narx: son(ol(row, u.narx)),
      summa: son(ol(row, u.summa)),
      sarlavha: iq.joriy,
      ...(marker ? { texnikBelgi: marker } : {}),
      manzil: manzil(r, u.nom),
      resurslar: [],
    };
    iq.ishKeldi();
    natija.ishlar.push(ish);
    return ish;
  };
  const mustaqilResurslar = (): Resurs[] => (natija.mustaqilResurslar ??= []);
  for (let r = u.malumotBoshi; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const toliq = toliqUstunlar(row);
    if (!toliq.length) continue;
    const birinchiMatn = xom(row[toliq[0]]);
    const bk = kalit(birinchiMatn);
    const texnik = rol === 'lrv' ? qatorTexnikTuri(row) : null;
    if (toliq.some((i) => IMZO.test(kalit(row[i])))) break;
    if (toliq.length <= 2 && AKT_IMZO.test(bk) && !toliq.some((i) => typeof row[i] === 'number')) break;
    // Ma'lumot ichida takrorlangan "1 | 2 | 3 | 4 …" ustun raqamlari qatori — ma'lumot emas.
    if (tartibRaqamlariQatorimi(row)) continue;

    const nomK = kalit(ol(row, u.nom));
    if (JAMI.test(bk) || JAMI.test(nomK) || HISOB_QATORI.test(bk)) {
      const jamiMatn = JAMI.test(bk) ? birinchiMatn : xom(ol(row, u.nom));
      const jamiQiymat = jamiQiymatiniOl(row, r);
      natija.jamilar.push({ xom: jamiMatn, qiymat: jamiQiymat.qiymat, manzil: manzil(r, jamiQiymat.ustun) });
      if (!vedomostRejimi) iq.jamiKeldi(jamiMatn);
      continue;
    }

    if (F2_PODVAL_QATORI.test(bk)) {
      review('f2_podval_qatori', 'F2 hisob/podval satri; ish-resurs moslashiga qo‘shilmadi, manba faylda saqlandi', r);
      continue;
    }

    // LRV_PLUS markerlari qatorning haqiqiy turini bildiradi. Ular tartib raqamidan
    // kuchliroq dalil: MAT/OB ishga yutib yuborilmaydi, RS esa raqam formati buzilsa
    // ham joriy ishga birikadi. MAT/OB RZ ostidagi sibling bo'lib qoladi (T1 treeBuild).
    if (texnik?.tur === 'rz') {
      const rzNomi = rzSarlavhaOl(row);
      if (!rzNomi) {
        review('rz_nomsiz', 'RZ belgisi bor, lekin ishonchli bo‘lim nomi topilmadi; qator tashlab ketilmadi, importdan oldin tekshiring', r);
        joriyIsh = null;
        iq.ishKeldi();
        continue;
      }
      let k = r + 1;
      while (k < rows.length && !toliqUstunlar(rows[k] ?? []).length) k++;
      const sarlavha = iq.sarlavha(rzNomi.xom, manzil(r, rzNomi.ustun), k < rows.length && rzQatormi(rows[k] ?? []));
      if (rzNomi.ustun !== u.nom) {
        sarlavha.dalil.push({ qoida: 't1_lrv_plus_rz_nom_fallback', ishonch: 'yuqori', izoh: 'aniq RZ markeri bor; sarlavha nom ustuni bo‘sh bo‘lgani uchun markerdan oldingi matn katagidan olindi' });
      }
      joriyIsh = null;
      continue;
    }

    const tartibKatak = ol(row, u.tartib);
    const nomBor = !bosh(ol(row, u.nom));

    if (vedomostRejimi) {
      if (butunTartib(tartibKatak) && nomBor) natija.vedomost.push(resursOl(row, r, true));
      else if (toliq.length <= 2 && !toliq.some((i) => son(row[i]) != null && typeof row[i] === 'number')) guruh = birinchiMatn;
      else review('noaniq_qator', `vedomost ichida tanilmagan qator: "${birinchiMatn.slice(0, 60)}"`, r);
      continue;
    }

    if (VEDOMOST_BOSHI.test(bk) && toliq.length <= 2 && natija.ishlar.length) {
      vedomostRejimi = true;
      guruh = /^ВЕДОМОСТЬ РЕСУРСОВ/.test(bk) ? null : birinchiMatn;
      joriyIsh = null;
      continue;
    }

    if (texnik?.tur === 'bl') {
      if (!nomBor && bosh(ol(row, u.shifr))) { review('bl_nomsiz', 'BL markerli qatorida nom ham, shifr ham yo‘q — qo‘lda ko‘rib chiqing', r); continue; }
      joriyIsh = ishYarat(row, r, texnik.belgi);
      continue;
    }
    if (texnik?.tur === 'rs') {
      if (!nomBor && bosh(ol(row, u.shifr))) { review('rs_nomsiz', 'RS markerli qatorida nom ham, shifr ham yo‘q — qo‘lda ko‘rib chiqing', r); continue; }
      iq.ishKeldi();
      const resurs = resursOl(row, r, false, texnik.belgi);
      if (joriyIsh) joriyIsh.resurslar.push(resurs);
      else {
        mustaqilResurslar().push(resurs);
        review('resurs_ishsiz', `RS qatori (${resurs.tartib || 'tartibsiz'}) uchun BL egasi topilmadi; qator yo‘qotilmadi, tekshirish kerak`, r);
      }
      continue;
    }
    if (texnik?.tur === 'mat' || texnik?.tur === 'ob') {
      if (!nomBor && bosh(ol(row, u.shifr))) { review(`${texnik.tur}_nomsiz`, `${texnik.tur.toUpperCase()} markerli qatorida nom ham, shifr ham yo‘q — qo‘lda ko‘rib chiqing`, r); continue; }
      iq.ishKeldi();
      mustaqilResurslar().push(resursOl(row, r, false, texnik.belgi));
      continue;
    }

    // Ish ostidagi resurs, lekin tartibi butun son ko'rinishida: Google Sheets "3.1" ni
    // sanaga aylantiradi (46025), ba'zi eksportlar "1,10" ni 1.1 emas matn qiladi.
    // Resurs kodi sof raqam (000001, 3, 1941) — ish shifri hech qachon sof raqam emas.
    if (joriyIsh && nomBor && butunTartib(tartibKatak) && /^\d{1,6}$/.test(xom(ol(row, u.shifr)))
      && (Number(xom(tartibKatak)) >= 1000 || son(ol(row, u.hajmBirlikka)) != null)) {
      iq.ishKeldi();
      joriyIsh.resurslar.push(resursOl(row, r, false));
      continue;
    }

    // Legacy Forma-2 ko'rinishi: ishda № п/п bor, resurs satrida esa tartib katagi
    // bo'sh; shifr raqamli, `Кат.` sarlavhali ustunda ЧЕЛ/МАШ/МАТ tur ko'rsatilgan.
    // Bu kombinatsiya resursni tasdiqlaydi; qator pozitsiyasi yoki nom o'xshashligi emas.
    if (joriyIsh && bosh(tartibKatak) && nomBor && !bosh(ol(row, u.birlik))
      && [u.hajmBirlikka, u.hajmLoyiha, u.narx, u.summa].some((column) => son(ol(row, column)) != null)
      && resursKategoriyaAniq(row, resursKategoriyaUstun)) {
      iq.ishKeldi();
      joriyIsh.resurslar.push(resursOl(row, r, false));
      continue;
    }

    if (butunTartib(tartibKatak) && (nomBor || !bosh(ol(row, u.shifr)))) {
      joriyIsh = ishYarat(row, r);
      continue;
    }

    // Resurs nomi bo'sh kelishi mumkin (real F2: formula havolasi uzilgan, "21.10 |
    // 006327 | ' ' | М3 | … | 441 mln") — kod bo'lsa resurs, nomsizligi review'da.
    if (ichkiTartib(tartibKatak) && (nomBor || !bosh(ol(row, u.shifr)))) {
      iq.ishKeldi();
      if (!joriyIsh) { review('resurs_ishsiz', `resurs "${xom(tartibKatak)}" hech bir ishga tegishli emas`, r); continue; }
      if (!nomBor) review('resurs_nomsiz', `resurs ${xom(tartibKatak)} (kod ${xom(ol(row, u.shifr))}) nomi bo'sh`, r);
      joriyIsh.resurslar.push(resursOl(row, r, false));
      continue;
    }

    if (sarlavhaShakli(row)) {
      let k = r + 1;
      while (k < rows.length && !toliqUstunlar(rows[k] ?? []).length) k++;
      iq.sarlavha(birinchiMatn, manzil(r, toliq[0]), k < rows.length && sarlavhaShakli(rows[k] ?? []));
      if (toliq.length > 1) review('sarlavha_kop_katak', `sarlavha qatorida ${toliq.length} ta katak — faqat birinchisi olindi`, r);
      continue;
    }
    review('noaniq_qator', `tanilmagan qator: "${birinchiMatn.slice(0, 60)}"`, r);
  }

  natija.sarlavhalar = iq.sarlavhalar.filter((s) => !natija.titul.includes(s));
  if (rol === 'lrv' && !natija.ishlar.length) review('ish_yoq', 'LRV sarlavhasi bor, lekin birorta ish qatori topilmadi');
  return natija;
}
