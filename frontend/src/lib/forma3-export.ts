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
  RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import {
  NAKRUTKA_KATLAR, kategoriyaKf, nakrutkaKaskadJS, nakrutkaKat, nakrutkaPodvaliYoz,
  type KatSummalar, type NakrutkaHisobJS,
} from './nakrutka-podval';

export interface Forma3ExportOptions {
  /** Asosiy obyekt nomi (titul «Объект:») va id si (guruh tartibi). */
  obyektNom: string;
  asosiyObyektId?: number | null;
  /** Hisobot davri «YYYY-MM» — oxirgi tasdiqlangan F2 oyi. */
  davr: string;
  /** Loyiha (shartnoma) nomi — ko'p obyektli hujjatda titulda. */
  loyihaNom?: string | null;
  shartnomaRaqam?: string | null;
  /** Hujjat raqami (bo'sh — to'ldirish chizig'i). */
  raqam?: string | null;
  imzo?: ImzoNomlar;
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
  /** СМЕТНАЯ (tasdiqlangan olib_tashlash chiqarilgan). */
  smetnaya: number | null;
}
/** Bolalari bor ish (tur, qiymatlari barglardan). */
export interface F3Ish { obyekt_id: number; q: NakopitelniyQator; bolalar: F3Qiymat[] }
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
        ish = { obyekt_id: ob.obyekt_id, q, bolalar: [] };
        if (rz) rz.ishlar.push(ish); else diqqat.push({ nom: nomOf(q), sabab: 'раздел не определен — строка вне раздела' });
        continue;
      }
      if (!BARG_TUR.has(q.tur)) continue;
      const qiymat: F3Qiymat = { obyekt_id: ob.obyekt_id, q, f2: { boshidan: 0, yildan: 0, davr: 0 }, smetnaya: chiq.has(q.qator_id) ? null : q.smeta_summa };
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
      const qiymat: F3Qiymat = { obyekt_id: x.obyekt_id, q: x.q, f2: { boshidan: 0, yildan: 0, davr: 0 }, smetnaya: chiq.has(x.q.qator_id) ? null : x.q.smeta_summa };
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

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 13, tur: 'kod' },
  { sarlavha: 'Наименование раздела, вида работ', kenglik: 46, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'кол-во', kenglik: 11, tur: 'hajm' },
  { sarlavha: 'цена, сум', kenglik: 13, tur: 'narx' },
  { sarlavha: 'сметная стоимость, сум', kenglik: 17, tur: 'pul' },
  { sarlavha: 'с начала строительства, сум', kenglik: 17, tur: 'pul', guruh: 'ПО УТВЕРЖДЕННЫМ АКТАМ ФОРМЫ № 2 (прямые затраты)' },
  { sarlavha: 'с начала года, сум', kenglik: 17, tur: 'pul', guruh: 'ПО УТВЕРЖДЕННЫМ АКТАМ ФОРМЫ № 2 (прямые затраты)' },
  { sarlavha: 'за отчетный период, сум', kenglik: 17, tur: 'pul', guruh: 'ПО УТВЕРЖДЕННЫМ АКТАМ ФОРМЫ № 2 (прямые затраты)' },
  // Yashirin texnik: kategoriya (podval SUMIF) va qiymat belgisi (jamilar SUMIF).
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
  { sarlavha: 'Т', kenglik: 4, tur: 'texnik', yashirin: true },
];
const KAT_USTUN = 'K';
const BARG_BELGI = 'L';

const fmt2 = (x: number): string => x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface Forma3Natija {
  bytes: Uint8Array;
  faylNomi: string;
  /** Kategoriya jamilari (podval SUMIF keshi bilan aynan) — 👁 panelda. */
  kat: Record<F3PulUstun, KatSummalar>;
  /** Har pul ustunining nakrutka kaskadi JS (UI == Excel). */
  kaskad: Record<F3PulUstun, NakrutkaHisobJS>;
  /** Eng pastki qatori — «ВСЕГО К ОПЛАТЕ» (kaskad natijasi). */
  vsegoKOplate: Record<F3PulUstun, number>;
  /** F2 tenglik nazorati: Σ ROUND(qiymat × Kf, 2). */
  kOplate: Record<F3PulUstun, number | null>;
  diqqat: Array<{ nom: string; sabab: string }>;
}

export function forma3Hujjat(m: Forma3Manba, o: Forma3ExportOptions): Forma3Natija {
  if (o.lineageRequired || o.lineage) {
    if (!o.lineage) throw new Error('LINEAGE_SCOPE_REQUIRED');
    assertF3Lineage(o.lineage);
  }
  const model = f3Model(m, o);
  const rows = f3ModelQatorlar(model);
  const davrMatn = f3DavrMatni(o.davr);

  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  if (!o.nakrutka || !Object.keys(o.nakrutka).length) {
    model.diqqat.push({ nom: 'Проценты накладных и прочих расходов', sabab: 'не заданы для объекта (договора) — в расчете приняты 0 %; стоимость к оплате отличается от прямых затрат только НДС' });
  }

  const qiymatIdx = f3QiymatIndekslar(rows);
  const ustunlar = f3UstunlarNatijasi(rows, qiymatIdx, nk);

  const v = new RasmiyVaraq({
    nom: 'Форма № 3',
    sarlavha: 'СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ',
    ostSarlavha: [
      'по объекту строительства (счет-фактура к актам формы № 2)',
      `за отчетный период: ${davrMatn} — учтены только УТВЕРЖДЕННЫЕ акты формы № 2`,
    ],
    titul: [
      ['Инвестор/Заказчик:', o.imzo?.zakazchik],
      ['Подрядчик:', o.imzo?.pudratchi],
      ['Объект:', o.obyektNom],
      ...(o.loyihaNom ? [['Локальные сметы (в составе):', o.loyihaNom]] as const : []),
      ['Договор:', o.shartnomaRaqam ?? null],
      ['Справка №:', o.raqam ?? null],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  const bosh = v.malumotBoshi;
  const n = (x: number | null | undefined): Qiymat => (x == null ? null : x);

  /** Oraliq + belgi bo'yicha SUMIF; himoyalangan (СМЕТНАЯ) — NULL qiymat bor bo'lsa bo'sh. */
  const yig = (c: F3PulUstun, idx: readonly number[], val: number | string | null): Qiymat => {
    if (!idx.length) return c === 'G' ? null : 0;
    const a = bosh + Math.min(...idx), b = bosh + Math.max(...idx);
    const rng = `${c}${a}:${c}${b}`, m2 = `${BARG_BELGI}${a}:${BARG_BELGI}${b}`;
    if (c !== 'G') return { f: `SUMIF(${m2},1,${rng})`, v: yaxlit2(val as number) };
    return { f: `IF(COUNTIFS(${m2},1,${rng},"")>0,"",SUMIF(${m2},1,${rng}))`, v: val === '' ? '' : yaxlit2(val as number) };
  };

  /** Bo'lim qiymatlaridan yig'indi keshi (SUMIF natijasi bilan aynan). */
  const yigQiymat = (idx: readonly number[], c: F3PulUstun): number | string | null => {
    if (!idx.length) return c === 'G' ? '' : 0;
    if (c === 'G') {
      let bor = false, s: number | null = 0;
      for (const i of idx) {
        const x = rows[i];
        if (!x || x.tur !== 'qiymat') continue;
        bor = true;
        if (x.x.smetnaya == null) s = null; else if (s != null) s += x.x.smetnaya;
      }
      if (!bor) return '';
      return s == null ? '' : yaxlit2(s);
    }
    let s = 0;
    for (const i of idx) {
      const x = rows[i];
      if (!x || x.tur !== 'qiymat') continue;
      s += c === 'H' ? x.x.f2.boshidan : c === 'I' ? x.x.f2.yildan : x.x.f2.davr;
    }
    return yaxlit2(s);
  };
  /** ИТОГО qatoriga tegishli qiymatlar (orqadagi razdel/guruh gacha). */
  const oraliqIdx = (itogoRejaIdx: number): number[] => {
    const out: number[] = [];
    for (let i = itogoRejaIdx - 1; i >= 0; i--) {
      const x = rows[i];
      if (x.tur === 'qiymat') out.push(i);
      else if (x.tur === 'razdel' || x.tur === 'guruh') break;
    }
    return out;
  };
  /** Ish qatoriga tegishli qiymatlar (ishdan keyingi barcha qiymat, keyingi non-qiymat gacha). */
  const ishBolalarIdx = (rs: readonly QatorReja[], ishRejaIdx: number): number[] => {
    const out: number[] = [];
    for (let i = ishRejaIdx + 1; i < rs.length; i++) {
      const x = rs[i];
      if (x.tur === 'qiymat') out.push(i);
      else break;
    }
    return out;
  };

  // ── Jadval qatorlari ──
  let raqam = 0;
  rows.forEach((x, i) => {
    let r: number;
    if (x.tur === 'guruh' || x.tur === 'razdel') {
      r = v.qator('jami', () => {
        const cells: Qiymat[] = Array(USTUNLAR.length).fill(null);
        cells[2] = x.nom;
        return cells;
      }, { daraja: x.tur === 'guruh' ? 0 : 1 });
    } else if (x.tur === 'qiymat') {
      const b = x.x;
      const q = b.q;
      r = v.qator('ish', () => [
        String(++raqam), q.kod ?? '', q.nom ?? '', q.birlik ?? '',
        n(q.smeta_hajm), n(q.smeta_narx),
        n(b.smetnaya),
        yaxlit2(b.f2.boshidan), yaxlit2(b.f2.yildan), yaxlit2(b.f2.davr),
        nakrutkaKat(q.kat) ?? '', 1,
      ], { daraja: 2 });
    } else if (x.tur === 'ish') {
      // Bolalari bor ish — qiymatlari barglardan (SUMIF, bolalar oralig'i).
      const q = x.x.q;
      const oraliq = ishBolalarIdx(rows, i);
      r = v.qator('ish', () => [
        String(++raqam), q.kod ?? '', q.nom ?? '', q.birlik ?? '',
        n(q.smeta_hajm), n(q.smeta_narx),
        yig('G', oraliq, yigQiymat(oraliq, 'G')),
        yig('H', oraliq, yigQiymat(oraliq, 'H')),
        yig('I', oraliq, yigQiymat(oraliq, 'I')),
        yig('J', oraliq, yigQiymat(oraliq, 'J')),
        '', '',
      ], { daraja: 1 });
    } else if (x.tur === 'itogo') {
      const idx = oraliqIdx(i);
      r = v.qator('jami', () => {
        const cells: Qiymat[] = Array(USTUNLAR.length).fill(null);
        cells[2] = x.nom;
        for (const c of F3_PUL) cells[c.charCodeAt(0) - 65] = yig(c, idx, yigQiymat(idx, c));
        return cells;
      }, { daraja: 0 });
    } else {
      r = v.qator('vsego', () => {
        const cells: Qiymat[] = Array(USTUNLAR.length).fill(null);
        cells[2] = x.nom;
        for (const c of F3_PUL) cells[c.charCodeAt(0) - 65] = yig(c, qiymatIdx, yigQiymat(qiymatIdx, c));
        return cells;
      });
    }
    if (r !== bosh + i) throw new Error('FORMA3_QATOR_SILJIDI');
  });

  // ── Nakrutka podvali — har pul ustuni uchun (to'g'ri xarajat → ВСЕГО К ОПЛАТЕ) ──
  const katSummalar: Record<string, KatSummalar> = {};
  for (const c of F3_PUL) katSummalar[c] = f3KatSumma(rows, qiymatIdx, c);
  const p = nakrutkaPodvaliYoz(v, {
    katUstun: KAT_USTUN, oraliq: [bosh, bosh + rows.length - 1],
    pulUstunlar: F3_PUL, foizUstun: 'F', nk, katSummalar,
  });

  // ── Izoh, diqqat, imzo, kitob ──
  v.bosh();
  v.izoh('Графы «с начала строительства», «с начала года», «за отчетный период» — по УТВЕРЖДЕННЫМ актам формы № 2, прямые затраты (без накладных расходов и НДС). Графа «сметная стоимость» — по утвержденной смете; работы, исключенные из остатка утвержденным изменением, в нее не входят.');
  v.izoh('«ВСЕГО К ОПЛАТЕ» (последняя строка расчета) = прямые затраты × коэффициент по виду затрат (транспортные, складские, прочие, страхование, риск, НДС).');
  if (o.smetaNakrutka) {
    v.izoh(`Сметная стоимость: прямые затраты ${fmt2(o.smetaNakrutka.pryamye)} сум; с накладными и прочими (без НДС) ${fmt2(o.smetaNakrutka.itogo4)} сум; НДС ${fmt2(o.smetaNakrutka.nds)} сум; всего с НДС ${fmt2(o.smetaNakrutka.vsego)} сум.`);
  }
  const diqqat = [...model.diqqat];
  // Ichki moslik nazorati: Σ qator «к оплате» ↔ podval kaskadi (yaxlitlash).
  const farqlar: string[] = [];
  for (const c of F3_PUL) {
    const ko = ustunlar.kOplate[c];
    const pod = p.kaskad[c].vsego;
    if (ko != null && Math.abs(ko - pod) > 0.005) farqlar.push(`${c}: Σ строк = ${fmt2(ko)}, ВСЕГО = ${fmt2(pod)}`);
  }
  if (farqlar.length) diqqat.push({ nom: 'ВСЕГО К ОПЛАТЕ', sabab: `сумма по строкам и расчет расходятся: ${farqlar.join('; ')}` });
  v.diqqat(diqqat);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v]);
  return {
    bytes,
    faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'ФОРМА_3', davr: o.davr }),
    kat: katSummalar as Record<F3PulUstun, KatSummalar>,
    kaskad: p.kaskad as Record<F3PulUstun, NakrutkaHisobJS>,
    vsegoKOplate: Object.fromEntries(F3_PUL.map((c) => [c, p.kaskad[c].vsego])) as Record<F3PulUstun, number>,
    kOplate: ustunlar.kOplate,
    diqqat,
  };
}
