/**
 * forma3-export.ts — F3 (СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ /
 * счет-фактура, Forma-3) — egasi (2026-09-26):
 *   "F3 — F2 lar ichidagi schet-faktura sahifalaridan chiqadi. Haqiqiy qonuniy
 *    F3 da razdellar va ish turlari narxlari bilan beriladi, oxirida nakrutka
 *    podvali, eng pastki qatori — oxirgi natija, u F2 summalari bilan bir xil
 *    bo'lishi kerak. Har F3 da umumiy summa, shu jumladan shu yil, obyekt
 *    boshidan beri va otchetniy period pozitsiyalari bor."
 *
 * Egasi qarorlari (chat, 2026-09-26; PTO_EGASI_QARORLARI Q1 javobi):
 *   - Jami qoidasi **B — nakrutka kaskadi**: F3 qatorlari прямые, oxirida
 *     nakrutka podvali (lib/nakrutka-podval.ts — server t2_nakrutka_hisobla_v1
 *     bilan aynan) → har pul ustunida «ВСЕГО К ОПЛАТЕ» — eng pastki qator.
 *   - Davr ustunlari (с начала строительства / с начала года / за отчетный
 *     период) — FAQAT holat='tasdiqlangan' F2 aktlaridan.
 *   - Qamrov: LOYIHA (shartnoma) — «ОБЪЕКТ:» guruh satrlari («в том числе»),
 *     asosiy obyekt birinchi; bitta obyekt bo'lsa oddiy hujjat.
 *   - Avans (удержание) hozir F3 ga kirmaydi.
 *
 * Qonunlar: NULL ≠ 0 (smetyasi noma'lum barg — СМЕТНАЯ bo'sh, jami bo'sh,
 * diqqatga; F2 oy qiymatlari 0 = shu davrda bajarilmagan); mashinist
 * "narxsiz" emas; tasdiqlangan olib_tashlash ishları СМЕТНАЯ dan chiqadi
 * (asli xom smetadagi qiymati bilan ko'rsatilmaydi, izohda aytiladi);
 * formulalar jonli va `$` siz; 255 argument chegarasi — yashirin kat/barg
 * ustunlari ustidagi SUMIF bilan; hujjat rus tilida (H9).
 *
 * F2 tenglik semantikasi (egasi §4): hujjatning H/I/J ustunlari F2 lardagi
 * BARG (resurs) qatorlarining to'g'ri xarajatlaridan yig'iladi — Nakopitelniy
 * bilan bir xil asos; «к оплате» nazоrati Σ ROUND(barg × Kf, 2) bilan
 * (`kOplate`). F2 qatori bl (resurssiz ish, M/К) ga bog'langan bo'lsa — u
 * qiymat qatori sifatida hujjatga kiradi va nazoratga kiritiladi.
 */
import type { NakopitelniyQator, SmetaNakrutka } from '../api/t2-nakopitelniy';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import type { PtoF3LineageInput } from './pto-document-lineage';
import { assertF3Lineage } from './pto-document-lineage';
import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, rasmiyKitob, yaxlit2,
  summaSozBilan, type ImzoNomlar, type Qiymat, type RasmiyUstun, type SarlavhaKatak,
} from './hujjat-yozuvchi';
import {
  NAKRUTKA_KATLAR, kategoriyaKf, nakrutkaKaskadJS, nakrutkaKat, nakrutkaPodvaliYoz,
  type KatSummalar, type NakrutkaHisobJS,
} from './nakrutka-podval';

/**
 * Bir tomonning TO'LIQ rekvizitlari — haqiqiy SPRAVKA-SCHET-FAKTURA blankasi
 * (F2 paketining o'z СЧЁТ-ФАКТ varag'i) namunasi bilan bir xil maydonlar:
 * egasi (2026-09-28): «har tarafni rekvizitlarini qo'ya oladigan kuchli
 * hujjat» — nom+imzo yetarli emas. Har maydon ixtiyoriy: bo'sh bo'lsa shu
 * qator titulda ko'rinmaydi (chiziq bilan majburlanmaydi).
 */
export interface Forma3Rekvizit {
  toliqNom?: string | null;
  manzil?: string | null;
  telefon?: string | null;
  /** Podratchi uchun «р/с», zakazchik uchun «Основной счёт» — ikkalasi ham hisob raqami. */
  hisobRaqam?: string | null;
  bank?: string | null;
  mfo?: string | null;
  inn?: string | null;
  oked?: string | null;
}

export interface Forma3ExportOptions {
  /** Asosiy obyekt nomi (titul «Объект:») va id si (guruh tartibi). */
  obyektNom: string;
  asosiyObyektId?: number | null;
  /** Hisobot davri «YYYY-MM» — oxirgi tasdiqlangan F2 oyi. */
  davr: string;
  /** Loyiha (shartnoma) nomi — ko'p obyektli hujjatda titulda. */
  loyihaNom?: string | null;
  shartnomaRaqam?: string | null;
  /** Shartnoma sanasi va umumiy shartnoma summasi — «Договор № … от … Общая договорная стоимость». */
  shartnomaSana?: string | null;
  shartnomaSumma?: number | null;
  /** Obyekt manzili — «Наименование объекта и его адрес» qatoriga qo'shiladi. */
  obyektManzil?: string | null;
  /** Hujjat raqami (bo'sh — to'ldirish chizig'i). */
  raqam?: string | null;
  /** Hujjat tuzilgan sana — bo'sh bo'lsa bugungi kun. */
  hujjatSana?: string | null;
  imzo?: ImzoNomlar;
  /** ПОДРЯДЧИК / ЗАКАЗЧИК to'liq rekvizitlari — titulda yonma-yon. */
  pudratchi?: Forma3Rekvizit | null;
  zakazchik?: Forma3Rekvizit | null;
  /** Obyekt nakrutka foizlari (t2_obyekt_nakrutka). null — 0 % + diqqat. */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** НДС stavkasi % (sukut 12, F3_NDS_SUKUT); null — kaskaddagi qiymat. */
  ndsFoiz?: number | null;
  /** Smeta nakrutka kaskadi (RPC jami.smeta_nakrutka) — izohda. */
  smetaNakrutka?: SmetaNakrutka | null;
  /** Tasdiqlangan o'zgarishlar (tur='olib_tashlash') — СМЕТНАЯ dan chiqadi. */
  ozgarishlar?: ReadonlyArray<{ holat: string; tur: string; qatorlar: ReadonlyArray<{ qator_id: number; amal: string }> }>;
  /** Canonical company → project → object → contract → period scope. */
  lineage?: PtoF3LineageInput;
  /** Real UI uchun scope majburiy; eski unit fixturelar backward-compatible qoladi. */
  lineageRequired?: boolean;
}

/** НДС sukuti (egasi qarori Q2) — Nakopitelniy bilan bir xil. */
export const F3_NDS_SUKUT = 12;

/** F3 manbasi (UI yig'adi; ikkinchi hisob yo'q). */
export interface Forma3Manba {
  /**
   * Obyekt bo'yicha TO'LIQ nakopitelniy qatorlari (t2_nakopitelniy_v2,
   * faqat_faol=false, sahifalab to'liq o'qilgan): struktura (razdel → ish →
   * barglar), smeta hajm/narx/summa, kat.
   */
  nakopitelniy: ReadonlyArray<{ obyekt_id: number; obyektNom: string; qatorlar: readonly NakopitelniyQator[] }>;
  /**
   * Tasdiqlangan F2 qatorlarining oylik to'g'ri xarajatlari — manba
   * t2_f2_tafsilot (akt_holat='tasdiqlangan'): har (obyekt, qator, oy) uchun
   * yig'indi. Barcha F3 ustunlari shu yig'indilardan.
   */
  f2Oylik: ReadonlyArray<{ obyekt_id: number; qator_id: number; oy: string; summa: number; akt_id?: number; akt_raqam?: string | null }>;
  /** Tasdiqlangan F2 fizik hajmlari (ish va resurs qatorlari) — 8/11/14-grafalar va chel.-ch/mash.-ch. */
  f2Hajm?: ReadonlyArray<{ obyekt_id: number; qator_id: number; oy: string; hajm: number }>;
}

/** Hujjatning pul ustunlari (to'g'ri xarajat) — podval ham shular ustida. */
export const F3_PUL = ['G', 'H', 'I', 'J'] as const;
export type F3PulUstun = typeof F3_PUL[number];

const BARG_TUR = new Set(['rs', 'mat', 'ob']);

/** «2026-09» → «сентябрь 2026 г.» */
export function f3DavrMatni(davr: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(davr || '');
  if (!m) return davr || '';
  const OYLAR = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  return `${OYLAR[Number(m[2]) - 1] ?? m[2]} ${m[1]} г.`;
}

/** Tasdiqlangan olib_tashlash qatorlari (СМЕТНАЯ dan chiqadi). */
export function olibTashlanganlar(o: Forma3ExportOptions['ozgarishlar']): ReadonlySet<number> {
  const s = new Set<number>();
  for (const oz of o ?? []) {
    if (oz.tur !== 'olib_tashlash' || oz.holat !== 'tasdiqlangan') continue;
    for (const q of oz.qatorlar) s.add(q.qator_id);
  }
  return s;
}

// ───────────────────────── Toza model ─────────────────────────

/** Bir qiymat qatorining (barg yoki bargsiz ish) uch F2 ustuni qiymati. */
export interface F3LeafF2 { boshidan: number; yildan: number; davr: number }

export interface F3Qiymat {
  obyekt_id: number;
  /** Barg (rs/mat/ob) yoki resurssiz ish (bl, bolalari yo'q). */
  q: NakopitelniyQator;
  f2: F3LeafF2;
  /** Tasdiqlangan F2 fizik hajmi (xuddi shu uch davr). */
  f2H: F3LeafF2;
  /** СМЕТНАЯ (tasdiqlangan olib_tashlash chiqarilgan). */
  smetnaya: number | null;
}
/** Bolalari bor ish (tur, qiymatlari barglardan). */
export interface F3Ish { obyekt_id: number; q: NakopitelniyQator; bolalar: F3Qiymat[]; f2H: F3LeafF2 }
export interface F3Razdel { obyekt_id: number; nom: string; ishlar: Array<F3Ish | F3Qiymat> }
export interface F3Guruh { obyekt_id: number; nom: string; asosiy: boolean }

export interface F3Model {
  guruhlar: F3Guruh[];
  razdellar: F3Razdel[];
  diqqat: Array<{ nom: string; sabab: string }>;
}

const nomOf = (q: NakopitelniyQator): string => `${q.kod ? q.kod + ' ' : ''}${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`.trim();

/**
 * F3 modeli: nakopitelniy qatorlaridan razdel → ish → qiymat (barglar va
 * resurssiz ishlar) strukturasini yig'adi va har qiymatning uch F2 ustuni
 * qiymatini hisoblaydi. Ob'ektlar tartibi: asosiy birinchi, qolgani nom
 * bo'yicha. Toza (UI siz).
 */
export function f3Model(m: Forma3Manba, o: Pick<Forma3ExportOptions, 'davr' | 'ozgarishlar' | 'asosiyObyektId'>): F3Model {
  const chiq = olibTashlanganlar(o.ozgarishlar);
  const yil = o.davr.slice(0, 4);
  const diqqat: Array<{ nom: string; sabab: string }> = [];

  const obyektlar = [...m.nakopitelniy].sort((a, b) =>
    (a.obyekt_id === o.asosiyObyektId ? -1 : b.obyekt_id === o.asosiyObyektId ? 1 : a.obyektNom.localeCompare(b.obyektNom)));

  // Struktura: razdel → ish → qiymatlar (barglar yoki bargsiz ish).
  const guruhlar: F3Guruh[] = [];
  const razdellar: F3Razdel[] = [];

  for (const ob of obyektlar) {
    guruhlar.push({ obyekt_id: ob.obyekt_id, nom: ob.obyektNom, asosiy: ob.obyekt_id === o.asosiyObyektId });
    let rz: F3Razdel | null = null;
    let ish: F3Ish | null = null;
    for (const q of ob.qatorlar) {
      if (q.tur === 'rz') {
        ish = null;
        rz = { obyekt_id: ob.obyekt_id, nom: q.nom ?? 'БЕЗ РАЗДЕЛА', ishlar: [] };
        razdellar.push(rz);
        continue;
      }
      if (q.tur === 'bl') {
        ish = { obyekt_id: ob.obyekt_id, q, bolalar: [], f2H: { boshidan: 0, yildan: 0, davr: 0 } };
        if (rz) rz.ishlar.push(ish); else diqqat.push({ nom: nomOf(q), sabab: 'раздел не определен — строка вне раздела' });
        continue;
      }
      if (!BARG_TUR.has(q.tur)) continue;
      const qiymat: F3Qiymat = { obyekt_id: ob.obyekt_id, q, f2: { boshidan: 0, yildan: 0, davr: 0 }, f2H: { boshidan: 0, yildan: 0, davr: 0 }, smetnaya: chiq.has(q.qator_id) ? null : q.smeta_summa };
      if (ish) ish.bolalar.push(qiymat);
      else if (rz) rz.ishlar.push(qiymat); // ishsiz barg (struktura buzilgan) — to'g'ridan razdelga
      if (q.smeta_summa == null && !chiq.has(q.qator_id)) diqqat.push({ nom: nomOf(q), sabab: 'нет стоимости по смете — сметная стоимость не определена' });
      if (!nakrutkaKat(q.kat)) diqqat.push({ nom: nomOf(q), sabab: 'не указан вид затрат (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М/К) — стоимость к оплате не определена' });
      if (chiq.has(q.qator_id)) diqqat.push({ nom: nomOf(q), sabab: 'исключено из остатка (изменение утверждено) — в сметной стоимости не учитывается' });
    }
  }

  // Bolalarsiz ish (М/К yoki resurssiz ish) — o'zi qiymat qatori: smetada
  // o'z narxi/summasi bor, F2 qiymati ham o'z qatoriga yozilgan (bl qatoriga).
  for (const rz of razdellar) {
    for (let i = 0; i < rz.ishlar.length; i++) {
      const x = rz.ishlar[i];
      if (!('bolalar' in x) || x.bolalar.length > 0) continue;
      const qiymat: F3Qiymat = { obyekt_id: x.obyekt_id, q: x.q, f2: { boshidan: 0, yildan: 0, davr: 0 }, f2H: { boshidan: 0, yildan: 0, davr: 0 }, smetnaya: chiq.has(x.q.qator_id) ? null : x.q.smeta_summa };
      rz.ishlar[i] = qiymat;
      if (x.q.smeta_summa == null && !chiq.has(x.q.qator_id)) diqqat.push({ nom: nomOf(x.q), sabab: 'нет стоимости по смете — сметная стоимость не определена' });
      if (!nakrutkaKat(x.q.kat)) diqqat.push({ nom: nomOf(x.q), sabab: 'не указан вид затрат (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М/К) — стоимость к оплате не определена' });
      if (chiq.has(x.q.qator_id)) diqqat.push({ nom: nomOf(x.q), sabab: 'исключено из остатка (изменение утверждено) — в сметной стоимости не учитывается' });
    }
  }

  // Hujjatda qatnashadigan qiymat qatorlari indekslari (f2 oylik yig'indilar uchun):
  const qiymatJoylar = new Map<string, F3Qiymat>();
  for (const rz of razdellar) for (const x of rz.ishlar) {
    if ('f2' in x) qiymatJoylar.set(`${rz.obyekt_id}:${x.q.qator_id}`, x);
    else for (const b of x.bolalar) qiymatJoylar.set(`${rz.obyekt_id}:${b.q.qator_id}`, b);
  }

  // F2 oylik yig'indilar → qiymat qatorlarining uch ustuni.
  const yetim: Array<{ obyekt_id: number; qator_id: number; oy: string; summa: number; akt_raqam?: string | null }> = [];
  for (const r of m.f2Oylik) {
    const t = qiymatJoylar.get(`${r.obyekt_id}:${r.qator_id}`);
    if (!t) { yetim.push(r); continue; }
    if (r.oy <= o.davr) t.f2.boshidan += r.summa;
    if (r.oy <= o.davr && r.oy.startsWith(yil)) t.f2.yildan += r.summa;
    if (r.oy === o.davr) t.f2.davr += r.summa;
  }
  // Fizik hajmlar: barg/resurssiz ish — o'z qatori; resursli ish — ish qatori.
  const ishJoylar = new Map<string, F3Ish>();
  for (const rz of razdellar) for (const x of rz.ishlar) if ('bolalar' in x) ishJoylar.set(`${rz.obyekt_id}:${x.q.qator_id}`, x);
  for (const r of m.f2Hajm ?? []) {
    const kalit = `${r.obyekt_id}:${r.qator_id}`;
    const t = qiymatJoylar.get(kalit)?.f2H ?? ishJoylar.get(kalit)?.f2H;
    if (!t) continue;
    if (r.oy <= o.davr) t.boshidan += r.hajm;
    if (r.oy <= o.davr && r.oy.startsWith(yil)) t.yildan += r.hajm;
    if (r.oy === o.davr) t.davr += r.hajm;
  }
  if (yetim.length) {
    const nam = yetim.slice(0, 3).map((x) => `«${x.akt_raqam ?? 'akt'}» ${x.oy}: ${x.summa.toFixed(2)}`).join('; ');
    diqqat.push({ nom: 'Акт Ф-2', sabab: `${yetim.length} ta qator hujjat strukturasida topilmadi (obyekt/qator mos emas) — kirmadi: ${nam}${yetim.length > 3 ? ' …' : ''}` });
  }
  return { guruhlar, razdellar, diqqat };
}

// ───────────────────────── Hujjat qatorlari rejasi (toza) ─────────────────────────

type QatorReja =
  | { tur: 'guruh'; nom: string }
  | { tur: 'razdel'; nom: string }
  | { tur: 'ish'; x: F3Ish }
  | { tur: 'qiymat'; x: F3Qiymat }
  | { tur: 'itogo'; nom: string }
  | { tur: 'jami'; nom: string };

/** Hujjat qatorlari (flat): guruh → razdel → ish → qiymatlar → ИТОГО → jami. */
export function f3ModelQatorlar(model: F3Model): QatorReja[] {
  const rows: QatorReja[] = [];
  let rd = 0;
  for (const g of model.guruhlar) {
    rows.push({ tur: 'guruh', nom: g.asosiy ? `ОБЪЕКТ: ${g.nom}` : `В ТОМ ЧИСЛЕ — ОБЪЕКТ: ${g.nom}` });
    while (rd < model.razdellar.length && model.razdellar[rd].obyekt_id === g.obyekt_id) {
      const rz = model.razdellar[rd];
      rows.push({ tur: 'razdel', nom: rz.nom });
      for (const x of rz.ishlar) {
        if ('bolalar' in x) {
          rows.push({ tur: 'ish', x });
          for (const b of x.bolalar) rows.push({ tur: 'qiymat', x: b });
        } else {
          rows.push({ tur: 'qiymat', x });
        }
      }
      rows.push({ tur: 'itogo', nom: `ИТОГО ПО РАЗДЕЛУ: ${rz.nom}` });
      rd++;
    }
  }
  rows.push({ tur: 'jami', nom: 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ (по всем объектам)' });
  return rows;
}

/** Qiymat qatorlari indekslari (reja bo'yicha). */
export function f3QiymatIndekslar(rows: readonly QatorReja[]): number[] {
  const out: number[] = [];
  rows.forEach((x, i) => { if (x.tur === 'qiymat') out.push(i); });
  return out;
}

/** Bir pul ustuni uchun kategoriya summalari (podval SUMIF keshi bilan aynan;
 *  NULL qiymat 0 deb yig'iladi — Excel SUMIF ham shunday, Nakopitelniy ham). */
export function f3KatSumma(rows: readonly QatorReja[], idx: readonly number[], c: F3PulUstun): KatSummalar {
  const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
  for (const i of idx) {
    const x = rows[i];
    if (!x || x.tur !== 'qiymat') continue;
    const kat = nakrutkaKat(x.x.q.kat);
    if (!kat) continue;
    const s = c === 'G' ? x.x.smetnaya : c === 'H' ? x.x.f2.boshidan : c === 'I' ? x.x.f2.yildan : x.x.f2.davr;
    ks[kat] += s ?? 0;
  }
  return ks;
}

/** F2 tenglik nazorati uchun qiymat «к оплате» si (Nakopitelniy semantikasi). */
export function f3QiymatKOplate(x: F3Qiymat, c: F3PulUstun, kf: Record<string, number>): number | null {
  const k = nakrutkaKat(x.q.kat);
  if (k == null) return null;
  const qiymat = c === 'G' ? x.smetnaya : c === 'H' ? x.f2.boshidan : c === 'I' ? x.f2.yildan : x.f2.davr;
  return qiymat == null ? null : yaxlit2(qiymat * kf[k]);
}

/** Hujjat ustunlari natijasi: kategoriya jamilari, kaskad, к оплате nazorati. */
export interface F3UstunNatija {
  kat: Record<F3PulUstun, KatSummalar>;
  kaskad: Record<F3PulUstun, NakrutkaHisobJS>;
  /** Σ ROUND(qiymat × Kf, 2); kat noma'lum qiymat bo'lsa null. */
  kOplate: Record<F3PulUstun, number | null>;
}

export function f3UstunlarNatijasi(rows: readonly QatorReja[], qiymatIdx: readonly number[], nk: Partial<NakrutkaKoeffitsientlar>): F3UstunNatija {
  const kf = kategoriyaKf(nk);
  const kat = {} as Record<F3PulUstun, KatSummalar>;
  const kaskad = {} as Record<F3PulUstun, NakrutkaHisobJS>;
  const ko = {} as Record<F3PulUstun, number | null>;
  for (const c of F3_PUL) {
    kat[c] = f3KatSumma(rows, qiymatIdx, c);
    kaskad[c] = nakrutkaKaskadJS(kat[c], nk);
    let jami: number | null = 0;
    let bor = false;
    for (const i of qiymatIdx) {
      const x = rows[i];
      if (!x || x.tur !== 'qiymat') continue;
      bor = true;
      const k = f3QiymatKOplate(x.x, c, kf);
      if (k == null) jami = null; else if (jami != null) jami += k;
    }
    ko[c] = bor ? (jami == null ? null : yaxlit2(jami)) : 0;
  }
  return { kat, kaskad, kOplate: ko };
}

// ───────────────────────── Excel hujjati ─────────────────────────
//
// RASMIY SHAKL (egasi 2026-09-29: "biz shu paytgacha qilgan F3 ga mos emas"):
// «Справка-счет-фактура о стоимости выполненных работ (понесенных затрат)» —
// Республиканская комиссия …, протокол от 21.05.04 г. № 02-5-56; 16 grafa (A..P).
// Manbalar: egasining 1_F3__ОБР, Amfiteatr СЧЁТ-ФАКТ (docs/product/FORMA3_…_SPEC.md),
// PTO.uz «вамкам.xlsx» Ф3, norma.uz «Указания по заполнению …»:
//   2 — объект, этапы, виды работ; 3 — ед. изм. (из сводного расчета ресурсов);
//   4/5 — объем в физ. показателях всего / на текущий год; 6/7 — стоимость в договорных
//   текущих ценах всего / на текущий год; 8, 11, 14 — выполнено в физ. показателях
//   (с начала строительства / с начала года / за отчетный месяц); 9, 12, 15 — % к объему
//   (гр.8:гр.4, гр.11:гр.5, гр.14:гр.5) × 100; 10, 13, 16 — стоимость выполненного.
// Podval (egasi): har kategoriya — shuncha chel.-ch, shuncha mash.-ch, material, oborudovaniye
// → прямые → транспорт/склад → прочие → страхование → НДС → «ИТОГО К ОПЛАТЕ» va so'z bilan.

/** Mantiqiy pul ustunlari → varaqdagi grafa (smeta 6, boshidan 10, yildan 13, oy 16). */
const VARAQ_USTUN: Record<F3PulUstun, string> = { G: 'F', H: 'J', I: 'M', J: 'P' };
const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 5, tur: 'tartib' },
  { sarlavha: 'Наименование', kenglik: 44, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'всего', kenglik: 11, tur: 'hajm' },
  { sarlavha: 'в т.ч. на текущий год', kenglik: 11, tur: 'hajm' },
  { sarlavha: 'всего', kenglik: 16, tur: 'pul' },
  { sarlavha: 'в т.ч. на текущий год', kenglik: 16, tur: 'pul' },
  { sarlavha: 'физ.', kenglik: 11, tur: 'hajm' },
  { sarlavha: '%', kenglik: 7, tur: 'foiz' },
  { sarlavha: 'сум', kenglik: 16, tur: 'pul' },
  { sarlavha: 'физ.', kenglik: 11, tur: 'hajm' },
  { sarlavha: '%', kenglik: 7, tur: 'foiz' },
  { sarlavha: 'сум', kenglik: 16, tur: 'pul' },
  { sarlavha: 'физ.', kenglik: 11, tur: 'hajm' },
  { sarlavha: '%', kenglik: 7, tur: 'foiz' },
  { sarlavha: 'сум', kenglik: 16, tur: 'pul' },
  // Yashirin texnik: kategoriya (ЧЕЛ/МАШ/…).
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
];
const KAT_USTUN = 'Q';
const SARLAVHA_KATAKLAR: SarlavhaKatak[] = [
  { c1: 0, qator: 0, qatorlar: 3, matn: '№ п/п' },
  { c1: 1, qator: 0, qatorlar: 3, matn: 'Наименование объектов, этапов, видов работ, оборудования, затрат' },
  { c1: 2, qator: 0, qatorlar: 3, matn: 'Ед. изм.' },
  { c1: 3, c2: 4, qator: 0, qatorlar: 2, matn: 'Объем работ и затрат в физических показателях' },
  { c1: 5, c2: 6, qator: 0, qatorlar: 2, matn: 'Стоимость в договорных текущих ценах, сум' },
  { c1: 7, c2: 15, qator: 0, matn: 'Выполненные работы (понесенные затраты)' },
  { c1: 7, c2: 9, qator: 1, matn: 'с начала строительства' },
  { c1: 10, c2: 12, qator: 1, matn: 'с начала года по отчетный месяц включительно' },
  { c1: 13, c2: 15, qator: 1, matn: 'в том числе за отчетный месяц' },
  { c1: 3, qator: 2, matn: 'всего' },
  { c1: 4, qator: 2, matn: 'в т.ч. на текущий год' },
  { c1: 5, qator: 2, matn: 'всего' },
  { c1: 6, qator: 2, matn: 'в т.ч. на текущий год' },
  { c1: 7, qator: 2, matn: 'в физических показателях' },
  { c1: 8, qator: 2, matn: 'в % к объему всего работ (гр.8:гр.4)×100' },
  { c1: 9, qator: 2, matn: 'в договорных текущих ценах, сум' },
  { c1: 10, qator: 2, matn: 'в физических показателях' },
  { c1: 11, qator: 2, matn: 'в % к объему (гр.11:гр.5)×100' },
  { c1: 12, qator: 2, matn: 'в договорных текущих ценах, сум' },
  { c1: 13, qator: 2, matn: 'в физических показателях' },
  { c1: 14, qator: 2, matn: 'в % к объему (гр.14:гр.5)×100' },
  { c1: 15, qator: 2, matn: 'в договорных текущих ценах, сум' },
];

const fmt2 = (x: number): string => x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const OYLAR_KATTA = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];

export interface Forma3Natija {
  bytes: Uint8Array;
  faylNomi: string;
  /** Kategoriya jamilari (G smeta, H boshidan, I yil boshidan, J davr). */
  kat: Record<F3PulUstun, KatSummalar>;
  /** Har pul ustunining nakrutka kaskadi JS (UI == Excel). */
  kaskad: Record<F3PulUstun, NakrutkaHisobJS>;
  /** Eng pastki qatori — «ИТОГО К ОПЛАТЕ» (kaskad natijasi). */
  vsegoKOplate: Record<F3PulUstun, number>;
  /** F2 tenglik nazorati: Σ ROUND(qiymat × Kf, 2). */
  kOplate: Record<F3PulUstun, number | null>;
  /** Kategoriya fizik ko'rsatkichlari: ЧЕЛ — чел.-ч (rabochiylar), МАШ — маш.-ч. */
  soatlar: Record<'ЧЕЛ' | 'МАШ', { smeta: number; boshidan: number; yildan: number; davr: number }>;
  diqqat: Array<{ nom: string; sabab: string }>;
}

/** Rabochiy mehnati (ЧЕЛ, birligi ЧЕЛ.-Ч, mashinist emas) yoki mashina (МАШ, МАШ.-Ч) soatimi. */
function soatTuri(q: NakopitelniyQator): 'ЧЕЛ' | 'МАШ' | null {
  const k = nakrutkaKat(q.kat);
  const b = (q.birlik ?? '').toUpperCase().replace(/\s/g, '');
  if (k === 'ЧЕЛ' && /ЧЕЛ/.test(b) && !/МАШИНИСТ/i.test(q.nom ?? '')) return 'ЧЕЛ';
  if (k === 'МАШ' && /МАШ/.test(b)) return 'МАШ';
  return null;
}

export function forma3Hujjat(m: Forma3Manba, o: Forma3ExportOptions): Forma3Natija {
  if (o.lineageRequired || o.lineage) {
    if (!o.lineage) throw new Error('LINEAGE_SCOPE_REQUIRED');
    assertF3Lineage(o.lineage);
  }
  const model = f3Model(m, o);
  const rows = f3ModelQatorlar(model);

  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  if (!o.nakrutka || !Object.keys(o.nakrutka).length) {
    model.diqqat.push({ nom: 'Проценты накладных и прочих расходов', sabab: 'не заданы для объекта (договора) — в расчете приняты 0 %; стоимость к оплате отличается от прямых затрат только НДС' });
  }
  const qiymatIdx = f3QiymatIndekslar(rows);
  const ustunlar = f3UstunlarNatijasi(rows, qiymatIdx, nk);

  // ── Titul ──
  const sanaMatni = (iso: string | null | undefined): string | null => {
    const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return x ? `${x[3]}.${x[2]}.${x[1]} г.` : null;
  };
  const dm = /^(\d{4})-(\d{2})$/.exec(o.davr || '');
  const davrOraligi = dm ? { boshi: `01.${dm[2]}.${dm[1]} г.`, oxiri: `${String(new Date(Number(dm[1]), Number(dm[2]), 0).getDate()).padStart(2, '0')}.${dm[2]}.${dm[1]} г.` } : null;
  const oyMatni = dm ? `ЗА ${OYLAR_KATTA[Number(dm[2]) - 1]} МЕСЯЦ ${dm[1]} ГОДА` : `ЗА ОТЧЕТНЫЙ ПЕРИОД ${f3DavrMatni(o.davr)}`;
  const pud = o.pudratchi ?? {};
  const zak = o.zakazchik ?? {};
  if (!zak.toliqNom && !o.imzo?.zakazchik) model.diqqat.push({ nom: 'Заказчик', sabab: 'реквизиты заказчика не заданы (нет договора с привязкой к заказчику) — строки заказчика оставлены для заполнения' });
  const obyektToliqNom = o.obyektManzil ? `${o.obyektNom}, ${o.obyektManzil}` : o.obyektNom;
  const dogovorMatn = o.shartnomaRaqam
    ? `№ ${o.shartnomaRaqam}${sanaMatni(o.shartnomaSana) ? ` от ${sanaMatni(o.shartnomaSana)}` : ''}${o.shartnomaSumma != null ? `${sanaMatni(o.shartnomaSana) ? '' : '.'} Общая стоимость в договорных текущих ценах: ${fmt2(o.shartnomaSumma)} сум` : ''}`
    : null;
  const raqamMatn = o.raqam ?? '';
  const sana = sanaMatni(o.hujjatSana) ?? sanaMatni(bugunSana()) ?? '';

  const v = new RasmiyVaraq({
    nom: 'Форма № 3',
    sarlavha: 'СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (ПОНЕСЕННЫХ ЗАТРАТ)',
    ostSarlavha: [oyMatni],
    oldBloklar: [
      [{ c1: 3, c2: 4, matn: 'Номер документа', tur: 'qutiQalin' }, { c1: 5, c2: 6, matn: 'Дата составления', tur: 'qutiQalin' }, { c1: 9, c2: 12, matn: 'Отчетный период', tur: 'qutiQalin' }],
      [{ c1: 3, c2: 4, matn: '', tur: 'quti' }, { c1: 5, c2: 6, matn: '', tur: 'quti' }, { c1: 9, c2: 10, matn: 'с', tur: 'quti' }, { c1: 11, c2: 12, matn: 'по', tur: 'quti' }],
      [{ c1: 3, c2: 4, matn: raqamMatn, tur: 'quti' }, { c1: 5, c2: 6, matn: sana, tur: 'quti' }, { c1: 9, c2: 10, matn: davrOraligi?.boshi ?? '', tur: 'quti' }, { c1: 11, c2: 12, matn: davrOraligi?.oxiri ?? '', tur: 'quti' }],
    ],
    ikkiTomonRekvizit: [
      ['Подрядчик:', pud.toliqNom ?? o.imzo?.pudratchi ?? '________________', 'Заказчик:', zak.toliqNom ?? o.imzo?.zakazchik ?? '________________'],
      ['Адрес:', pud.manzil ?? '________________', 'Адрес:', zak.manzil ?? '________________'],
      ['Телефон:', pud.telefon, 'Телефон:', zak.telefon],
      ['Расчетный счет:', pud.hisobRaqam ?? '________________', 'Расчетный счет:', zak.hisobRaqam ?? '________________'],
      ['Банк:', pud.bank ?? '________________', 'Банк:', zak.bank ?? '________________'],
      ['МФО:', pud.mfo ?? '________', 'МФО:', zak.mfo ?? '________'],
      ['ИНН:', pud.inn ?? '________', 'ИНН:', zak.inn ?? '________'],
      ['ОКЭД:', pud.oked, 'ОКЭД:', zak.oked],
    ],
    titul: [
      ['Наименование объекта и его адрес:', obyektToliqNom],
      ['Договор', dogovorMatn],
    ],
    maxsusSarlavha: { qatorSoni: 3, kataklar: SARLAVHA_KATAKLAR, balandliklar: [30, 42, 66] },
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });

  const r2 = (x: number) => yaxlit2(x);
  const foizF = (sum: string, asos: string, r: number, v2: number | null): Qiymat =>
    ({ f: `IF(${asos}${r}=0,"",${sum}${r}/${asos}${r}*100)`, v: v2 == null ? '' : r2(v2) });
  const ulush = (a: number, b: number | null | undefined): number | null => (b ? (a / b) * 100 : null);

  // ── Jadval: obyekt → I. СМР → razdel → ishlar (fizik ko'rsatkich bilan) ──
  type QatorMalumot = { smeta: number | null; b: number; y: number; d: number };
  const bolimYoz = (matn: string) => v.bolim(matn, { daraja: 0 });
  const razdelQatorlari: number[] = [];
  let raqam = 0;
  const umumiy = { soat: { ЧЕЛ: { smeta: 0, boshidan: 0, yildan: 0, davr: 0 }, МАШ: { smeta: 0, boshidan: 0, yildan: 0, davr: 0 } } };

  const qiymatlar = (x: F3Qiymat): QatorMalumot => ({ smeta: x.smetnaya, b: x.f2.boshidan, y: x.f2.yildan, d: x.f2.davr });
  const ishYig = (x: F3Ish): QatorMalumot => {
    let smeta: number | null = 0;
    const s = { b: 0, y: 0, d: 0 };
    for (const c of x.bolalar) {
      if (c.smetnaya == null) smeta = null; else if (smeta != null) smeta += c.smetnaya;
      s.b += c.f2.boshidan; s.y += c.f2.yildan; s.d += c.f2.davr;
    }
    return { smeta, ...s };
  };
  // Soatlar (chel.-ch / mash.-ch) — barglardan.
  for (const rz of model.razdellar) for (const x of rz.ishlar) {
    const barglar = 'bolalar' in x ? x.bolalar : [x];
    for (const bq of barglar) {
      const t = soatTuri(bq.q);
      if (!t) continue;
      umumiy.soat[t].smeta += bq.q.smeta_hajm ?? 0;
      umumiy.soat[t].boshidan += bq.f2H.boshidan; umumiy.soat[t].yildan += bq.f2H.yildan; umumiy.soat[t].davr += bq.f2H.davr;
    }
  }

  let oldingiObyekt: number | null = null;
  for (const rz of model.razdellar) {
    if (!rz.ishlar.length) continue; // bo'sh (fayl nomi/guruh) razdel — hujjatga kirmaydi
    if (rz.obyekt_id !== oldingiObyekt) {
      const g = model.guruhlar.find((x) => x.obyekt_id === rz.obyekt_id);
      bolimYoz(g?.asosiy === false ? `в том числе — ${g.nom}` : (g?.nom ?? o.obyektNom));
      if (oldingiObyekt == null) bolimYoz('I. СТРОИТЕЛЬНО-МОНТАЖНЫЕ РАБОТЫ');
      oldingiObyekt = rz.obyekt_id;
    }
    // Razdel qatori — o'z ishlari yig'indisi (jonli SUM) va % (pul bo'yicha).
    const ishQatorlar: number[] = [];
    const rzQ = v.r;
    let rzS: number | null = 0, rzB = 0, rzY = 0, rzD = 0;
    for (const x of rz.ishlar) {
      const d = 'bolalar' in x ? ishYig(x) : qiymatlar(x);
      if (d.smeta == null) rzS = null; else if (rzS != null) rzS += d.smeta;
      rzB += d.b; rzY += d.y; rzD += d.d;
    }
    const rzSatr = (c: string) => (rz.ishlar.length ? `SUM(${c}${rzQ + 1}:${c}${rzQ + rz.ishlar.length})` : '0');
    v.qator('jami', (r) => {
      const c: Qiymat[] = Array(USTUNLAR.length).fill(null);
      c[1] = rz.nom; c[2] = 'сум';
      c[5] = { f: rzSatr('F'), v: rzS == null ? '' : r2(rzS) }; c[6] = { f: `F${r}`, v: rzS == null ? '' : r2(rzS) };
      c[9] = { f: rzSatr('J'), v: r2(rzB) }; c[8] = foizF('J', 'F', r, ulush(rzB, rzS));
      c[12] = { f: rzSatr('M'), v: r2(rzY) }; c[11] = foizF('M', 'G', r, ulush(rzY, rzS));
      c[15] = { f: rzSatr('P'), v: r2(rzD) }; c[14] = foizF('P', 'G', r, ulush(rzD, rzS));
      return c;
    }, { daraja: 1 });
    razdelQatorlari.push(rzQ);
    for (const x of rz.ishlar) {
      const q = x.q;
      const d = 'bolalar' in x ? ishYig(x) : qiymatlar(x);
      const h = 'bolalar' in x ? x.f2H : x.f2H;
      const hajm = q.smeta_hajm;
      const r = v.qator('oddiy', (rr) => [
        String(++raqam), `${q.kod ? q.kod + ' ' : ''}${q.nom ?? ''}`.trim(), q.birlik ?? '',
        hajm ?? null, hajm == null ? null : { f: `D${rr}`, v: hajm },
        d.smeta == null ? null : r2(d.smeta), d.smeta == null ? null : { f: `F${rr}`, v: r2(d.smeta) },
        h.boshidan || null, foizF('H', 'D', rr, hajm ? ulush(h.boshidan, hajm) : null), r2(d.b),
        h.yildan || null, foizF('K', 'E', rr, hajm ? ulush(h.yildan, hajm) : null), r2(d.y),
        h.davr || null, foizF('N', 'E', rr, hajm ? ulush(h.davr, hajm) : null), r2(d.d),
        'bolalar' in x ? '' : (nakrutkaKat(q.kat) ?? ''),
      ], { daraja: 2 });
      ishQatorlar.push(r);
      if (d.smeta == null) { /* diqqat f3Model da yozilgan */ }
    }
  }
  // ИТОГО прямые затраты (razdellar yig'indisi — jonli).
  const pry = ustunlar.kaskad;
  const itogoQ = v.qator('vsego', (r) => {
    const c: Qiymat[] = Array(USTUNLAR.length).fill(null);
    const sm = (col: string) => (razdelQatorlari.length ? razdelQatorlari.map((x) => `${col}${x}`).join('+') : '0');
    c[1] = 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО ОБЪЕКТУ'; c[2] = 'сум';
    c[5] = { f: sm('F'), v: pry.G.pryamye }; c[6] = { f: `F${r}`, v: pry.G.pryamye };
    c[9] = { f: sm('J'), v: pry.H.pryamye }; c[8] = foizF('J', 'F', r, ulush(pry.H.pryamye, pry.G.pryamye));
    c[12] = { f: sm('M'), v: pry.I.pryamye }; c[11] = foizF('M', 'G', r, ulush(pry.I.pryamye, pry.G.pryamye));
    c[15] = { f: sm('P'), v: pry.J.pryamye }; c[14] = foizF('P', 'G', r, ulush(pry.J.pryamye, pry.G.pryamye));
    return c;
  });

  // ── Podval: har kategoriya (soat + summa) → kaskad → ИТОГО К ОПЛАТЕ ──
  const katSummalar: Record<string, KatSummalar> = {};
  for (const c of F3_PUL) katSummalar[VARAQ_USTUN[c]] = ustunlar.kat[c];
  katSummalar.G = ustunlar.kat.G; // «в т.ч. на текущий год» = всего (график не задан)
  const s = umumiy.soat;
  const p = nakrutkaPodvaliYoz(v, {
    katUstun: KAT_USTUN, oraliq: [itogoQ, itogoQ], pulUstunlar: ['F', 'G', 'J', 'M', 'P'], foizUstun: 'C', nk, katSummalar,
    katFormulasiz: true, kfJadval: false,
    sarlavha: 'РАСЧЕТ СТОИМОСТИ К ОПЛАТЕ ПО ОБЪЕКТУ: прямые затраты по видам (физ. показатели и стоимость) → накладные и прочие → НДС',
    vsegoNom: 'ИТОГО К ОПЛАТЕ (с учетом НДС)',
    katHajm: {
      birlikUstun: 'C',
      qiymat: {
        D: { ЧЕЛ: r2(s.ЧЕЛ.smeta), МАШ: r2(s.МАШ.smeta) }, E: { ЧЕЛ: r2(s.ЧЕЛ.smeta), МАШ: r2(s.МАШ.smeta) },
        H: { ЧЕЛ: r2(s.ЧЕЛ.boshidan), МАШ: r2(s.МАШ.boshidan) },
        K: { ЧЕЛ: r2(s.ЧЕЛ.yildan), МАШ: r2(s.МАШ.yildan) },
        N: { ЧЕЛ: r2(s.ЧЕЛ.davr), МАШ: r2(s.МАШ.davr) },
      },
    },
  });
  const vq = p.vsegoQator;
  const kaskadLog = { G: p.kaskad.F, H: p.kaskad.J, I: p.kaskad.M, J: p.kaskad.P } as Record<F3PulUstun, NakrutkaHisobJS>;
  // Bajarilish ulushi (pul bo'yicha) — «ИТОГО К ОПЛАТЕ» ga nisbatan (namuna: 114,0 % / 24,3 % / 1,5 %).
  v.qator('jami', () => {
    const c: Qiymat[] = Array(USTUNLAR.length).fill(null);
    c[1] = 'Выполнение к стоимости по смете (договору), %';
    c[8] = foizF('J', 'F', vq, ulush(kaskadLog.H.vsego, kaskadLog.G.vsego));
    c[11] = foizF('M', 'G', vq, ulush(kaskadLog.I.vsego, kaskadLog.G.vsego));
    c[14] = foizF('P', 'G', vq, ulush(kaskadLog.J.vsego, kaskadLog.G.vsego));
    return c;
  });
  // «ИТОГО: 7620061020,12  Семь миллиардов … сум 12 тийин с НДС» — shu oy to'lovi.
  const oyTolov = kaskadLog.J.vsego;
  v.bosh();
  v.blok([
    { c1: 0, c2: 1, matn: 'ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ:', tur: 'qalin' },
    { c1: 2, c2: 4, matn: { f: `P${vq}`, v: oyTolov }, tur: 'qalin' },
    { c1: 5, c2: 15, matn: `${summaSozBilan(oyTolov)} с НДС`, tur: 'qalin' },
  ], 20);

  // ── Izoh, diqqat, imzo ──
  v.bosh();
  v.izoh('Графы 8–16 — по УТВЕРЖДЕННЫМ актам формы № 2 (с начала строительства / с начала года / за отчетный месяц). Графы 6–7 — стоимость по утвержденной смете (прямые затраты по разделам); итог к оплате — с транспортными, складскими, прочими расходами, страхованием и НДС по ставкам объекта. График производства работ на текущий год не задан — графы 5 и 7 приняты равными графам 4 и 6.');
  v.izoh('Физические показатели по видам затрат: затраты труда рабочих-строителей — чел.-ч; эксплуатация машин и механизмов — маш.-ч (по утвержденным актам формы № 2).');
  const diqqat = [...model.diqqat];
  const farqlar: string[] = [];
  for (const c of F3_PUL) {
    const ko = ustunlar.kOplate[c];
    const pod = kaskadLog[c].vsego;
    if (ko != null && Math.abs(ko - pod) > 0.005) farqlar.push(`гр.${VARAQ_USTUN[c]}: Σ строк = ${fmt2(ko)}, ИТОГО = ${fmt2(pod)}`);
  }
  if (farqlar.length) diqqat.push({ nom: 'ИТОГО К ОПЛАТЕ', sabab: `сумма по строкам и расчет расходятся: ${farqlar.join('; ')}` });
  v.diqqat(diqqat);
  v.bosh();
  const imzoQator = (rol: string, nom?: string | null) => {
    v.blok([
      { c1: 0, c2: 1, matn: rol, tur: 'imzo' }, { c1: 2, c2: 4, matn: '____________________', tur: 'imzo' },
      { c1: 5, c2: 6, matn: nom?.trim() || 'Ф.И.О. ____________________', tur: 'imzo' },
    ], 22);
    v.blok([{ c1: 2, c2: 4, matn: '(подпись)', tur: 'izoh' }]);
  };
  // Imzolar (rasmiy blanka): ПОДРЯДЧИК — rahbar va bosh buxgalter, М.П.; ЗАКАЗЧИК — xuddi shunday.
  v.blok([{ c1: 0, c2: 6, matn: `ПОДРЯДЧИК:  ${pud.toliqNom ?? o.imzo?.pudratchi ?? ''}`.trim(), tur: 'qalin' }]);
  imzoQator('Руководитель', null);
  imzoQator('Главный бухгалтер', null);
  v.blok([{ c1: 0, c2: 1, matn: 'М.П.', tur: 'izoh' }]);
  v.bosh();
  v.blok([{ c1: 0, c2: 6, matn: `ЗАКАЗЧИК:  ${zak.toliqNom ?? o.imzo?.zakazchik ?? ''}`.trim(), tur: 'qalin' }]);
  imzoQator('Руководитель', null);
  imzoQator('Главный бухгалтер', null);
  v.blok([{ c1: 0, c2: 1, matn: 'М.П.', tur: 'izoh' }]);
  v.bosh();
  v.izoh('Форма одобрена решением Республиканской комиссии по мониторингу за реализацией реформ и лицензированию деятельности в области строительства (протокол от 21.05.2004 г. № 02-5-56). Заполняется ежемесячно подрядной организацией и представляется заказчику для подтверждения.');
  const { bytes } = rasmiyKitob([v]);
  return {
    bytes,
    faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'ФОРМА_3', davr: o.davr }),
    kat: ustunlar.kat,
    kaskad: kaskadLog,
    vsegoKOplate: Object.fromEntries(F3_PUL.map((c) => [c, kaskadLog[c].vsego])) as Record<F3PulUstun, number>,
    kOplate: ustunlar.kOplate,
    soatlar: {
      ЧЕЛ: { smeta: r2(s.ЧЕЛ.smeta), boshidan: r2(s.ЧЕЛ.boshidan), yildan: r2(s.ЧЕЛ.yildan), davr: r2(s.ЧЕЛ.davr) },
      МАШ: { smeta: r2(s.МАШ.smeta), boshidan: r2(s.МАШ.boshidan), yildan: r2(s.МАШ.yildan), davr: r2(s.МАШ.davr) },
    },
    diqqat,
  };
}
