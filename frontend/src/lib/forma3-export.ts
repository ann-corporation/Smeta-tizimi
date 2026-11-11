import { nomIzohBilan } from './smeta-model';
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
import { narxsizSoni } from './narx-bildirishnoma';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import type { PtoF3LineageInput } from './pto-document-lineage';
import { assertF3Lineage } from './pto-document-lineage';
import { sumRefs } from './hujjat-yozuvchi/formula';
import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  summaSozBilan, type ImzoNomlar, type Qiymat, type RasmiyUstun, type SarlavhaKatak,
} from './hujjat-yozuvchi';
import { f3SotuvdanHisobla, somga, type SvodShartnoma } from './nakopitelniy-svod';
import {
  NAKRUTKA_KATLAR, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz,
  type KatSummalar,
} from './nakrutka-podval';
import { NDS_SUKUT_FOIZ, qqsAjratTiyin, qqsSumma, kaskad as yadroKaskad, kOplate, podvalNdsFoizi, serverMerosKoefQoy, standartPodval, type KaskadNatija, type Podval } from './hisob-yadro';
import { raqamTozala } from './raqam-belgi';

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

/**
 * Forma-3 shakli (egasi 2026-11-03): `toliq` — razdel/ish turi/hajm/narx bilan to'liq hujjat (o'zgarmagan);
 * `bir_qatorli` — ish ro'yxatisiz BITTA yig'ma qator + podval (summa NDS siz, NDS, jami NDS bilan); sarlavha,
 * rekvizit va imzolar bir xil, summalar bir xil yadrodan (tiyingacha teng).
 */
export type Forma3Shakl = 'toliq' | 'bir_qatorli';
export const F3_SHAKLLAR: ReadonlyArray<Forma3Shakl> = ['toliq', 'bir_qatorli'];
/** Noma'lum/eski qiymat — to'liq shakl (sukut). */
export const f3ShaklTozala = (x: unknown): Forma3Shakl => (x === 'bir_qatorli' ? 'bir_qatorli' : 'toliq');

export interface Forma3ExportOptions {
  /** Hujjat shakli: sukut `toliq`. */
  shakl?: Forma3Shakl;
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
  /** Server `nk_manba` — meros foizlari izohi (yadro `serverMerosKoefQoy`). */
  nkManba?: string | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** НДС stavkasi % (sukut 12, F3_NDS_SUKUT); null — kaskaddagi qiymat. */
  ndsFoiz?: number | null;
  /** Smeta nakrutka kaskadi (RPC jami.smeta_nakrutka) — izohda. */
  smetaNakrutka?: SmetaNakrutka | null;
  /** Tasdiqlangan o'zgarishlar (tur='olib_tashlash') — СМЕТНАЯ dan chiqadi. */
  ozgarishlar?: ReadonlyArray<{ holat: string; tur: string; qatorlar: ReadonlyArray<{ qator_id: number; amal: string }> }>;
  /**
   * EGASI QARORI (2026-11-06, audit C M12): «за отчетный месяц» K OPLATE — HAR akt O'Z F2 podvali bilan (t2_akt_podval: nk /
   * storno bloki podvali; yo'q bo'lsa smeta podvali) — F3 oy jami = shu oy F2 hujjatlari ВСЕГО yig'indisi. Hisob yagona
   * `f2AktBaho` (lib/f2-akt-eksport) dan; bu yerda faqat yoziladi. Berilmasa — eski xulq (smeta podvali kaskadi).
   */
  davrAktlari?: ReadonlyArray<F3DavrAkt>;
  /** Canonical company → project → object → contract → period scope. */
  lineage?: PtoF3LineageInput;
  /** Real UI uchun scope majburiy; eski unit fixturelar backward-compatible qoladi. */
  lineageRequired?: boolean;
}

/** Hisobot oyining bitta tasdiqlangan F2 akti — yadro bahosi (`f2AktBaho`) natijasi. null — noma'lum (0 emas). */
export type F3DavrAkt = { aktId: number; raqam: string | null; hujjatPodvali: boolean; ustamasiz: number; ustamali: number | null; qqs: number | null; qqsBilan: number | null };

/** Davr aktlari jami (QQS bilan): birortasi noma'lum — null (NULL ≠ 0). */
export function f3DavrAktlarJami(aktlar: ReadonlyArray<F3DavrAkt>): number | null {
  let s = 0;
  for (const a of aktlar) { if (a.qqsBilan == null) return null; s += a.qqsBilan; }
  return yaxlit2(s);
}

/** НДС sukuti (egasi qarori Q2) — Nakopitelniy bilan bir xil. */
export const F3_NDS_SUKUT = NDS_SUKUT_FOIZ;

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
export interface F3Razdel { obyekt_id: number; nom: string; q?: NakopitelniyQator; ishlar: Array<F3Ish | F3Qiymat> }
export interface F3Guruh { obyekt_id: number; nom: string; asosiy: boolean }

/** Rasmiy blankaga yuzlab bir xil texnik «замечание» qatori chiqmasin: bir xil sababli qatorlar bitta qatorga (soni bilan, 3 tagacha nom misol). To‘liq ro‘yxat modelda (`diqqat`) qoladi. */
function diqqatGuruh(d: ReadonlyArray<{ nom: string; sabab: string }>): Array<{ nom: string; sabab: string }> {
  const g = new Map<string, string[]>();
  for (const x of d) { const a = g.get(x.sabab) ?? []; a.push(x.nom); g.set(x.sabab, a); }
  return [...g.entries()].map(([sabab, noms]) => noms.length === 1
    ? { nom: noms[0], sabab }
    : { nom: `${noms.length} позиций (например: ${noms.slice(0, 3).join('; ')}${noms.length > 3 ? ' …' : ''})`, sabab });
}

export interface F3Model {
  guruhlar: F3Guruh[];
  razdellar: F3Razdel[];
  diqqat: Array<{ nom: string; sabab: string }>;
}

const nomOf = (q: NakopitelniyQator): string => nomIzohBilan(`${q.kod ? q.kod + ' ' : ''}${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`.trim(), q.ozgarish_izoh);

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
        rz = { obyekt_id: ob.obyekt_id, nom: q.nom ?? 'БЕЗ РАЗДЕЛА', q, ishlar: [] };
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
    /* Egasi (2026-10-02, Game Club sinovi bilan tasdiqlangan): «за отчетный период» — FAQAT shu oy F2 si;
     * «с начала строительства» va «в т.ч. текущего года» — FAQAT oldin yopilgan (hisobot oyidan oldingi) F2 lar.
     * Shu oy summasi keyingi oy F3 sida boshqa ustunlarga o'tadi (iyul F3: 1 435,9 / 1 435,9 / 1 106,3). */
    if (r.oy < o.davr) t.f2.boshidan += r.summa;
    if (r.oy < o.davr && r.oy.startsWith(yil)) t.f2.yildan += r.summa;
    if (r.oy === o.davr) t.f2.davr += r.summa;
  }
  // Fizik hajmlar: barg/resurssiz ish — o'z qatori; resursli ish — ish qatori.
  const ishJoylar = new Map<string, F3Ish>();
  for (const rz of razdellar) for (const x of rz.ishlar) if ('bolalar' in x) ishJoylar.set(`${rz.obyekt_id}:${x.q.qator_id}`, x);
  for (const r of m.f2Hajm ?? []) {
    const kalit = `${r.obyekt_id}:${r.qator_id}`;
    const t = qiymatJoylar.get(kalit)?.f2H ?? ishJoylar.get(kalit)?.f2H;
    if (!t) continue;
    if (r.oy < o.davr) t.boshidan += r.hajm;
    if (r.oy < o.davr && r.oy.startsWith(yil)) t.yildan += r.hajm;
    if (r.oy === o.davr) t.davr += r.hajm;
  }
  for (const rz of razdellar) for (const x of rz.ishlar) {
    const base = x.q.smeta_hajm, accepted = x.f2H.boshidan + x.f2H.davr;
    if (base != null && base >= 0 && accepted > base + 1e-9) diqqat.push({
      nom: nomOf(x.q), sabab: `объем по утвержденным Ф-2 (${accepted} ${x.q.birlik ?? ''}) превышает объем сметы (${base}); проверьте привязку, единицы и корректировочные акты — процент не ограничен искусственно`,
    });
  }
  /* m9 (audit C): yetim summa endi F3 dan JIM TUSHMAYDI. Ikki holat:
   *  - qator strukturada ISH (bolasi bor bl) — server barg qoidasi: ish o'z summasini sanamaydi (resurslarida) → sanalmaydi, izoh;
   *  - qator strukturada umuman yo'q — alohida «ВНЕ СТРУКТУРЫ СМЕТЫ» razdelida qiymat qatori (jamilar va podvalga kiradi). */
  const ishYetim = yetim.filter((x) => ishJoylar.has(`${x.obyekt_id}:${x.qator_id}`));
  const tashqi = yetim.filter((x) => !ishJoylar.has(`${x.obyekt_id}:${x.qator_id}`));
  if (ishYetim.length) {
    diqqat.push({ nom: 'Акт Ф-2', sabab: `${ishYetim.length} сумм(ы) указаны на строке работы, у которой есть ресурсы — по правилу «лист сметы» учитываются только ресурсы (как на сервере), сумма работы не суммируется повторно` });
  }
  if (tashqi.length) {
    const qiymatlar = new Map<string, F3Qiymat>();
    for (const r of tashqi) {
      const kalit = `${r.obyekt_id}:${r.qator_id}`;
      let x = qiymatlar.get(kalit);
      if (!x) {
        const q = { qator_id: r.qator_id, tartib: 0, kod: null, nom: `Строка Ф-2 #${r.qator_id} (вне структуры сметы)`, birlik: null, tur: 'mat', kat: null, qoshimcha: false, zamena: false,
          smeta_hajm: null, smeta_narx: null, smeta_summa: null } as unknown as NakopitelniyQator;
        x = { obyekt_id: r.obyekt_id, q, f2: { boshidan: 0, yildan: 0, davr: 0 }, f2H: { boshidan: 0, yildan: 0, davr: 0 }, smetnaya: null };
        qiymatlar.set(kalit, x);
      }
      if (r.oy < o.davr) x.f2.boshidan += r.summa;
      if (r.oy < o.davr && r.oy.startsWith(yil)) x.f2.yildan += r.summa;
      if (r.oy === o.davr) x.f2.davr += r.summa;
    }
    const byOb = new Map<number, F3Qiymat[]>();
    for (const x of qiymatlar.values()) byOb.set(x.obyekt_id, [...(byOb.get(x.obyekt_id) ?? []), x]);
    for (const [obId, xs] of byOb) razdellar.push({ obyekt_id: obId, nom: 'ВНЕ СТРУКТУРЫ СМЕТЫ (строки Ф-2 без привязки)', ishlar: xs });
    const nam = tashqi.slice(0, 3).map((x) => `«${x.akt_raqam ?? 'akt'}» ${x.oy}: ${x.summa.toFixed(2)}`).join('; ');
    diqqat.push({ nom: 'Акт Ф-2', sabab: `${tashqi.length} строк(и) не найдены в структуре сметы — включены отдельным разделом «вне структуры сметы», вид затрат не указан (без накрутки): ${nam}${tashqi.length > 3 ? ' …' : ''}` });
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

/**
 * Egasi qoidasi (2026-11-06): Forma-3 da smeta qiymati noma'lum (narxsiz) barglar soni — jamilar yonida
 * «Внимание: N строк без цены — итог неполный». Tasdiqlangan olib_tashlash qatorlari sanalmaydi (СМЕТНАЯ dan chiqqan),
 * mashinist mehnati sanalmaydi (yagona qoida: `narxsizSoni`). Shart f3Model diqqat («нет стоимости по смете») bilan bir xil.
 */
export function f3NarxsizSoni(model: F3Model, chiq: ReadonlySet<number>): number {
  const barglar = model.razdellar.flatMap((rz) => rz.ishlar.flatMap((x) => ('bolalar' in x ? x.bolalar : [x])))
    .filter((b) => !chiq.has(b.q.qator_id)).map((b) => b.q);
  return narxsizSoni(barglar, (q) => q.smeta_summa);
}

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
export function f3QiymatKOplate(x: F3Qiymat, c: F3PulUstun, kf: Record<string, number | null>, ndsFoiz: number | null = null): number | null {
  const qiymat = c === 'G' ? x.smetnaya : c === 'H' ? x.f2.boshidan : c === 'I' ? x.f2.yildan : x.f2.davr;
  // Vid zatrat ko'rsatilmagan — ustamasiz, faqat QQS (yadro `kOplate`).
  return kOplate(qiymat, nakrutkaKat(x.q.kat), kf, false, ndsFoiz);
}

/** Kategoriyasi ko'rsatilmagan qiymatlar jami (ustamasiz qism — podvalda alohida qator). */
export function f3NomalumSumma(rows: readonly QatorReja[], idx: readonly number[], c: F3PulUstun): number {
  let t = 0;
  for (const i of idx) {
    const x = rows[i];
    if (!x || x.tur !== 'qiymat' || nakrutkaKat(x.x.q.kat)) continue;
    t += (c === 'G' ? x.x.smetnaya : c === 'H' ? x.x.f2.boshidan : c === 'I' ? x.x.f2.yildan : x.x.f2.davr) ?? 0;
  }
  return yaxlit2(t);
}

/** Hujjat ustunlari natijasi: kategoriya jamilari, kaskad, к оплате nazorati. */
export interface F3UstunNatija {
  kat: Record<F3PulUstun, KatSummalar>;
  kaskad: Record<F3PulUstun, KaskadNatija>;
  /** Kategoriyasi ko'rsatilmagan summa (ustamasiz qism). */
  nomalum: Record<F3PulUstun, number>;
  /** Σ ROUND(qiymat × Kf, 2); kat noma'lum qiymat bo'lsa null. */
  kOplate: Record<F3PulUstun, number | null>;
}

export function f3UstunlarNatijasi(rows: readonly QatorReja[], qiymatIdx: readonly number[], nk: Partial<NakrutkaKoeffitsientlar>, podval: Podval | null = null): F3UstunNatija {
  const kf = kategoriyaKf(nk, podval);
  const kat = {} as Record<F3PulUstun, KatSummalar>;
  const kaskad = {} as Record<F3PulUstun, KaskadNatija>;
  const p = podval ?? standartPodval(nk);
  const nds = podvalNdsFoizi(p);
  const nomalum = {} as Record<F3PulUstun, number>;
  const ko = {} as Record<F3PulUstun, number | null>;
  for (const c of F3_PUL) {
    kat[c] = f3KatSumma(rows, qiymatIdx, c);
    nomalum[c] = f3NomalumSumma(rows, qiymatIdx, c);
    kaskad[c] = yadroKaskad(kat[c], p, { asosiy: c === F3_PUL[0], nomalumQism: nomalum[c] || null });
    let jami: number | null = 0;
    let bor = false;
    for (const i of qiymatIdx) {
      const x = rows[i];
      if (!x || x.tur !== 'qiymat') continue;
      bor = true;
      const k = f3QiymatKOplate(x.x, c, kf, nds);
      if (k == null) jami = null; else if (jami != null) jami += k;
    }
    ko[c] = bor ? (jami == null ? null : yaxlit2(jami)) : 0;
  }
  return { kat, kaskad, nomalum, kOplate: ko };
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
  // Yashirin texnik: F3 qatorining kaliti (smeta qatori id) — «Ф-2 (источник)» varag'idan SUMIFS uchun.
  { sarlavha: 'Ключ', kenglik: 8, tur: 'texnik', yashirin: true },
];
/** «Bir qatorli» shakl ustunlari: № | Наименование | Ставка | 4 pul ustuni (F3_PUL tartibida: D, E, F, G). */
const USTUNLAR_BIR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Наименование', kenglik: 56, tur: 'matn' },
  { sarlavha: 'Ставка, %', kenglik: 10, tur: 'birlik' },
  { sarlavha: 'Стоимость по смете (договору)', kenglik: 20, tur: 'pul' },
  { sarlavha: 'с начала строительства (до отчетного месяца)', kenglik: 20, tur: 'pul', guruh: 'ВЫПОЛНЕННЫЕ РАБОТЫ (ПОНЕСЕННЫЕ ЗАТРАТЫ), сум' },
  { sarlavha: 'в том числе текущего года (до отчетного месяца)', kenglik: 20, tur: 'pul', guruh: 'ВЫПОЛНЕННЫЕ РАБОТЫ (ПОНЕСЕННЫЕ ЗАТРАТЫ), сум' },
  { sarlavha: 'за отчетный месяц', kenglik: 20, tur: 'pul', guruh: 'ВЫПОЛНЕННЫЕ РАБОТЫ (ПОНЕСЕННЫЕ ЗАТРАТЫ), сум' },
];
const BIR_USTUN: Record<F3PulUstun, string> = { G: 'D', H: 'E', I: 'F', J: 'G' };
const BIR_DAVR_NOM: Record<F3PulUstun, string> = { G: 'по смете', H: 'с начала строительства', I: 'текущего года', J: 'за отчетный месяц' };
const KAT_USTUN = 'Q';
const KALIT_USTUN = 'R';
/** Manba varag'i: F3 ga kirgan har bir tasdiqlangan F2 qatori (egasi 2026-09-30: "qayerdan olinganini
 *  bilish uchun maksimal formula"). F3 dagi F2 summalari/hajmlari shu varaqdan SUMIFS bilan olinadi. */
const MANBA_VARAQ = 'Ф-2 (источник)';
const MANBA_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: 'Ключ строки Ф-3', kenglik: 10, tur: 'kod' },
  { sarlavha: 'Вид', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'Акт Ф-2', kenglik: 12, tur: 'kod' },
  { sarlavha: 'Месяц (ГГГГММ)', kenglik: 10, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 14, tur: 'kod' },
  { sarlavha: 'Наименование позиции', kenglik: 52, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'Количество', kenglik: 13, tur: 'hajm' },
  { sarlavha: 'Сумма, сум', kenglik: 16, tur: 'pul' },
];
const SARLAVHA_KATAKLAR: SarlavhaKatak[] = [
  { c1: 0, qator: 0, qatorlar: 3, matn: '№ п/п' },
  { c1: 1, qator: 0, qatorlar: 3, matn: 'Наименование объектов, этапов, видов работ, оборудования, затрат' },
  { c1: 2, qator: 0, qatorlar: 3, matn: 'Ед. изм.' },
  { c1: 3, c2: 4, qator: 0, qatorlar: 2, matn: 'Объем работ и затрат в физических показателях' },
  { c1: 5, c2: 6, qator: 0, qatorlar: 2, matn: 'Стоимость в договорных текущих ценах, сум' },
  { c1: 7, c2: 15, qator: 0, matn: 'Выполненные работы (понесенные затраты)' },
  { c1: 7, c2: 9, qator: 1, matn: 'с начала строительства (до отчетного месяца)' },
  { c1: 10, c2: 12, qator: 1, matn: 'в том числе текущего года (до отчетного месяца)' },
  { c1: 13, c2: 15, qator: 1, matn: 'за отчетный месяц' },
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
  shakl: Forma3Shakl;
  bytes: Uint8Array;
  faylNomi: string;
  /** Kategoriya jamilari (G smeta, H boshidan, I yil boshidan, J davr). */
  kat: Record<F3PulUstun, KatSummalar>;
  /** Har pul ustunining kaskadi (yadro; UI == Excel). */
  kaskad: Record<F3PulUstun, KaskadNatija>;
  /** Eng pastki qatori — «ИТОГО К ОПЛАТЕ» (kaskad natijasi); null — foiz noma'lum. */
  vsegoKOplate: Record<F3PulUstun, number | null>;
  /** ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ: davrAktlari berilsa — Σ aktlar o'z podvali bilan (M12), aks holda podval kaskadi. */
  oyKOplate: number | null;
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
    model.diqqat.push({ nom: 'Проценты накладных и прочих расходов', sabab: 'не заданы для объекта (договора) — стоимость к оплате не определена (проценты не принимаются равными 0)' });
  }
  const qiymatIdx = f3QiymatIndekslar(rows);
  const podval = o.podval ? serverMerosKoefQoy(o.podval, nk, o.nkManba) : null;
  const ustunlar = f3UstunlarNatijasi(rows, qiymatIdx, nk, podval);

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
    ? `№ ${raqamTozala(o.shartnomaRaqam)}${sanaMatni(o.shartnomaSana) ? ` от ${sanaMatni(o.shartnomaSana)}` : ''}${o.shartnomaSumma != null ? `${sanaMatni(o.shartnomaSana) ? '' : '.'} Общая стоимость в договорных текущих ценах: ${fmt2(o.shartnomaSumma)} сум` : ''}`
    : null;
  const raqamMatn = o.raqam ?? '';
  const sana = sanaMatni(o.hujjatSana) ?? sanaMatni(bugunSana()) ?? '';

  const bir = o.shakl === 'bir_qatorli';
  const v = new RasmiyVaraq({
    nom: 'Форма № 3',
    sarlavha: 'СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (ПОНЕСЕННЫХ ЗАТРАТ)',
    ostSarlavha: [oyMatni],
    oldBloklar: bir ? [
      [{ c1: 0, c2: 1, matn: 'Номер документа', tur: 'qutiQalin' }, { c1: 2, c2: 3, matn: 'Дата составления', tur: 'qutiQalin' }, { c1: 4, c2: 6, matn: 'Отчетный период', tur: 'qutiQalin' }],
      [{ c1: 0, c2: 1, matn: '', tur: 'quti' }, { c1: 2, c2: 3, matn: '', tur: 'quti' }, { c1: 4, matn: 'с', tur: 'quti' }, { c1: 5, c2: 6, matn: 'по', tur: 'quti' }],
      [{ c1: 0, c2: 1, matn: raqamMatn, tur: 'quti' }, { c1: 2, c2: 3, matn: sana, tur: 'quti' }, { c1: 4, matn: davrOraligi?.boshi ?? '', tur: 'quti' }, { c1: 5, c2: 6, matn: davrOraligi?.oxiri ?? '', tur: 'quti' }],
    ] : [
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
    ...(bir ? {} : { maxsusSarlavha: { qatorSoni: 3, kataklar: SARLAVHA_KATAKLAR, balandliklar: [30, 42, 66] } }),
    ustunlar: bir ? USTUNLAR_BIR : USTUNLAR,
    yonalish: 'landscape',
  });

  const r2 = (x: number) => yaxlit2(x);
  const foizF = (sum: string, asos: string, r: number, v2: number | null): Qiymat =>
    ({ f: `IF(${asos}${r}=0,"",${sum}${r}/${asos}${r}*100)`, v: v2 == null ? '' : r2(v2) });
  const ulush = (a: number | null | undefined, b: number | null | undefined): number | null => (b && a != null ? (a / b) * 100 : null);

  // ── Jadval: obyekt → I. СМР → razdel → ishlar (fizik ko'rsatkich bilan) ──
  type QatorMalumot = { smeta: number | null; b: number; y: number; d: number };
  const bolimYoz = (matn: string) => v.bolim(matn, { daraja: 0 });
  const razdelQatorlari: number[] = [];
  let raqam = 0;
  const umumiy = { soat: { ЧЕЛ: { smeta: 0, boshidan: 0, yildan: 0, davr: 0 }, МАШ: { smeta: 0, boshidan: 0, yildan: 0, davr: 0 } } };

  const qiymatlar = (x: F3Qiymat): QatorMalumot => ({ smeta: x.smetnaya, b: x.f2.boshidan, y: x.f2.yildan, d: x.f2.davr });
  const ishYig = (x: F3Ish): QatorMalumot => {
    let smeta: number | null = null;
    const s = { b: 0, y: 0, d: 0 };
    for (const c of x.bolalar) {
      if (c.smetnaya != null) smeta = (smeta ?? 0) + c.smetnaya;
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

  const manba: Array<{ kalit: number; vid: 'сумма' | 'объем'; akt: string; oy: number; kod: string; nom: string; birlik: string; hajm: number | null; summa: number | null }> = [];
  const s = umumiy.soat;
  let vq: number;
  let kaskadLog: Record<F3PulUstun, KaskadNatija>;
  const davrUstun = bir ? BIR_USTUN.J : VARAQ_USTUN.J;
  const foizUstunBir = 'C';
  const colBir = (L: string) => L.charCodeAt(0) - 65;
  if (bir) {
    // ── «Bir qatorli» shakl: ish ro'yxati, hajm va narx YO'Q. BITTA yig'ma qator + podval (NDS siz → NDS → NDS bilan). ──
    // Summalar to'liq shakl podvali bilan BIR XIL yadrodan (`f3UstunlarNatijasi` → `kaskad`): ИТОГО-4 (NDS siz), НДС, ВСЕГО.
    const kk = ustunlar.kaskad;
    const davrNom = davrOraligi ? `с ${davrOraligi.boshi} по ${davrOraligi.oxiri}` : f3DavrMatni(o.davr);
    const satrNom = `Выполненные строительно-монтажные работы по объекту ${o.obyektNom} за период ${davrNom}`;
    const hujayra = (fill: (c: F3PulUstun, L: string) => Qiymat): Qiymat[] => {
      const out: Qiymat[] = Array(USTUNLAR_BIR.length).fill(null);
      for (const c of F3_PUL) out[colBir(BIR_USTUN[c])] = fill(c, BIR_USTUN[c]);
      return out;
    };
    const satrQ = v.qator('oddiy', () => {
      const out = hujayra((c) => (kk[c].itogo4 == null ? null : r2(kk[c].itogo4!)));
      out[0] = 1; out[1] = satrNom;
      return out;
    });
    const bezQ = v.qator('jami', () => {
      const out = hujayra((c, L) => (kk[c].itogo4 == null ? null : { f: `${L}${satrQ}`, v: r2(kk[c].itogo4!) }));
      out[1] = 'СУММА БЕЗ НДС';
      return out;
    });
    const ndsFoizi = kk.G.qqsFoiz;
    const ndsQ = v.qator('oddiy', (rr) => {
      const out = hujayra((c, L) => {
        const q = kk[c].qqs, base = kk[c].itogo4;
        if (q == null) return null;
        // Formula faqat standart qadam bilan mos kelganda; aks holda yadro qiymati o'zi (maxsus podval).
        return ndsFoizi != null && base != null && qqsSumma(base, ndsFoizi) === q ? { f: `ROUND(${L}${bezQ}*${foizUstunBir}${rr}/100,2)`, v: r2(q) } : r2(q);
      });
      out[1] = 'НДС';
      out[colBir(foizUstunBir)] = ndsFoizi == null ? null : { n: ndsFoizi, uslub: 'foiz' };
      return out;
    });
    vq = v.qator('vsego', () => {
      const out = hujayra((c, L) => {
        const t = kk[c].vsego, base = kk[c].itogo4, q = kk[c].qqs;
        if (t == null) return null;
        return base != null && q != null && yaxlit2(base + q) === t ? { f: `${L}${bezQ}+${L}${ndsQ}`, v: r2(t) } : r2(t);
      });
      out[1] = 'ВСЕГО К ОПЛАТЕ (С УЧЕТОМ НДС)';
      return out;
    });
    kaskadLog = kk;
  } else {
  const oyNum = (oy: string) => Number(oy.slice(0, 7).replace('-', ''));
  const davrNum = oyNum(o.davr);
  const yilBoshNum = Number(o.davr.slice(0, 4) + '01');
  const rzById = new Map(model.razdellar.filter(r => r.q).map(r => [`${r.obyekt_id}:${r.q!.qator_id}`, r]));
  const parentOf = (r: F3Razdel) => r.q?.ota_id == null ? undefined : rzById.get(`${r.obyekt_id}:${r.q.ota_id}`);
  const under = (child: F3Razdel, ancestor: F3Razdel) => {
    const seen = new Set<F3Razdel>();
    for (let r: F3Razdel | undefined = child; r && !seen.has(r); r = parentOf(r)) {
      if (r === ancestor) return true;
      seen.add(r);
    }
    return false;
  };
  const descendants = (r: F3Razdel) => model.razdellar.filter(child => under(child, r));
  const visibleSections = model.razdellar.filter(r => descendants(r).some(c => c.ishlar.length));
  // План адресов включает вложенные разделы; итог объекта складывает только корни.
  const plannedRows = new Map<F3Razdel, number>();
  let plannedRow = v.r, plannedObject: number | null = null;
  for (const r of visibleSections) {
    if (r.obyekt_id !== plannedObject) { plannedRow += plannedObject == null ? 2 : 1; plannedObject = r.obyekt_id; }
    plannedRows.set(r, plannedRow); plannedRow += 1 + r.ishlar.length;
  }
  let oldingiObyekt: number | null = null;
  for (const rz of visibleSections) {
    if (rz.obyekt_id !== oldingiObyekt) {
      const g = model.guruhlar.find((x) => x.obyekt_id === rz.obyekt_id);
      bolimYoz(g?.asosiy === false ? `в том числе — ${g.nom}` : (g?.nom ?? o.obyektNom));
      if (oldingiObyekt == null) bolimYoz('I. СТРОИТЕЛЬНО-МОНТАЖНЫЕ РАБОТЫ');
      oldingiObyekt = rz.obyekt_id;
    }
    // Известная сумма не исчезает из-за неизвестного ресурса: он остаётся в diqqat.
    // Razdel qatori — o'z ishlari yig'indisi (jonli SUM) va % (pul bo'yicha).
    const ishQatorlar: number[] = [];
    const rzQ = v.r;
    let rzS: number | null = null, rzB = 0, rzY = 0, rzD = 0;
    for (const x of descendants(rz).flatMap(r => r.ishlar)) {
      const d = 'bolalar' in x ? ishYig(x) : qiymatlar(x);
      if (d.smeta != null) rzS = (rzS ?? 0) + d.smeta;
      rzB += d.b; rzY += d.y; rzD += d.d;
    }
    const ranges = descendants(rz).filter(r => r.ishlar.length).map(r => ({ start: plannedRows.get(r)! + 1, end: plannedRows.get(r)! + r.ishlar.length }));
    const rzSatr = (c: string) => ranges.map(r => `SUM(${c}${r.start}:${c}${r.end})`).join('+') || '0';
    if (plannedRows.get(rz) !== rzQ) throw new Error('F3_SECTION_ROW_MISMATCH');
    v.qator('jami', (r) => {
      const c: Qiymat[] = Array(USTUNLAR.length).fill(null);
      c[1] = rz.nom; c[2] = 'сум';
      c[5] = { f: rzSatr('F'), v: rzS == null ? '' : r2(rzS) }; c[6] = { f: `F${r}`, v: rzS == null ? '' : r2(rzS) };
      c[9] = { f: rzSatr('J'), v: r2(rzB) }; c[8] = foizF('J', 'F', r, ulush(rzB, rzS));
      c[12] = { f: rzSatr('M'), v: r2(rzY) }; c[11] = foizF('M', 'G', r, ulush(rzY, rzS));
      c[15] = { f: rzSatr('P'), v: r2(rzD) }; c[14] = foizF('P', 'G', r, ulush(rzD, rzS));
      return c;
    }, { daraja: 1 });
    if (!parentOf(rz)) razdelQatorlari.push(rzQ);
    for (const x of rz.ishlar) {
      const q = x.q;
      const d = 'bolalar' in x ? ishYig(x) : qiymatlar(x);
      const h = 'bolalar' in x ? x.f2H : x.f2H;
      const hajm = q.smeta_hajm;
      // Manba satrlari: pul — barglar (ish ichidagi resurslar yoki o'zi), hajm — shu qator.
      const bargIdlar = new Set<number>('bolalar' in x ? x.bolalar.map((b) => b.q.qator_id) : [q.qator_id]);
      for (const f of m.f2Oylik) if (f.obyekt_id === x.obyekt_id && bargIdlar.has(f.qator_id) && f.oy <= o.davr) {
        const bq = ('bolalar' in x ? x.bolalar.find((b) => b.q.qator_id === f.qator_id)?.q : q) ?? q;
        manba.push({ kalit: q.qator_id, vid: 'сумма', akt: f.akt_raqam ?? (f.akt_id != null ? `№ ${f.akt_id}` : ''), oy: oyNum(f.oy), kod: bq.kod ?? '', nom: bq.nom ?? '', birlik: bq.birlik ?? '', hajm: null, summa: f.summa });
      }
      for (const f of m.f2Hajm ?? []) if (f.obyekt_id === x.obyekt_id && f.qator_id === q.qator_id && f.oy <= o.davr) {
        manba.push({ kalit: q.qator_id, vid: 'объем', akt: '', oy: oyNum(f.oy), kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '', hajm: f.hajm, summa: null });
      }
      const pulBor = [...bargIdlar].some((id) => m.f2Oylik.some((f) => f.qator_id === id && f.oy <= o.davr));
      const hajmBor = (m.f2Hajm ?? []).some((f) => f.qator_id === q.qator_id && f.oy <= o.davr);
      const sif = (ustun: 'H' | 'I', vid: string, shart: string, rr: number) => `SUMIFS('${MANBA_VARAQ}'!${ustun}:${ustun},'${MANBA_VARAQ}'!A:A,${KALIT_USTUN}${rr},'${MANBA_VARAQ}'!B:B,"${vid}",${shart})`;
      const B = (rr: number, ustun: 'H' | 'I', vid: string) => sif(ustun, vid, `'${MANBA_VARAQ}'!D:D,"<${davrNum}"`, rr);
      const Y = (rr: number, ustun: 'H' | 'I', vid: string) => sif(ustun, vid, `'${MANBA_VARAQ}'!D:D,">=${yilBoshNum}",'${MANBA_VARAQ}'!D:D,"<${davrNum}"`, rr);
      const D = (rr: number, ustun: 'H' | 'I', vid: string) => sif(ustun, vid, `'${MANBA_VARAQ}'!D:D,${davrNum}`, rr);
      const r = v.qator('oddiy', (rr) => [
        String(++raqam), nomIzohBilan(`${q.kod ? q.kod + ' ' : ''}${q.nom ?? ''}`.trim(), q.ozgarish_izoh), q.birlik ?? '',
        hajm ?? null, hajm == null ? null : { f: `D${rr}`, v: hajm },
        d.smeta == null ? null : r2(d.smeta), d.smeta == null ? null : { f: `F${rr}`, v: r2(d.smeta) },
        hajmBor ? { f: B(rr, 'H', 'объем'), v: h.boshidan } : (h.boshidan || null), foizF('H', 'D', rr, hajm ? ulush(h.boshidan, hajm) : null), pulBor ? { f: B(rr, 'I', 'сумма'), v: r2(d.b) } : r2(d.b),
        hajmBor ? { f: Y(rr, 'H', 'объем'), v: h.yildan } : (h.yildan || null), foizF('K', 'E', rr, hajm ? ulush(h.yildan, hajm) : null), pulBor ? { f: Y(rr, 'I', 'сумма'), v: r2(d.y) } : r2(d.y),
        hajmBor ? { f: D(rr, 'H', 'объем'), v: h.davr } : (h.davr || null), foizF('N', 'E', rr, hajm ? ulush(h.davr, hajm) : null), pulBor ? { f: D(rr, 'I', 'сумма'), v: r2(d.d) } : r2(d.d),
        'bolalar' in x ? '' : (nakrutkaKat(q.kat) ?? ''),
        q.qator_id,
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
  // Kategoriyasi ko'rsatilmagan qiymatlar — podvalda alohida «без накрутки» qatori (server kabi ИТОГО-4 ga ustamasiz).
  const nomF3: Record<string, number> = {};
  for (const c of F3_PUL) nomF3[VARAQ_USTUN[c]] = ustunlar.nomalum[c];
  nomF3.G = ustunlar.nomalum.G;
  const nomalumF3 = Object.values(nomF3).some((x) => Math.abs(x) >= 0.005) ? nomF3 : null;
  const p = nakrutkaPodvaliYoz(v, { podval,
    katUstun: KAT_USTUN, oraliq: [itogoQ, itogoQ], pulUstunlar: ['F', 'G', 'J', 'M', 'P'], foizUstun: 'C', nk, katSummalar,
    katFormulasiz: true, kfJadval: false, nomalum: nomalumF3,
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
  vq = p.vsegoQator;
  kaskadLog = { G: p.natija.F, H: p.natija.J, I: p.natija.M, J: p.natija.P } as Record<F3PulUstun, KaskadNatija>;
  // Bajarilish ulushi (pul bo'yicha) — «ИТОГО К ОПЛАТЕ» ga nisbatan (namuna: 114,0 % / 24,3 % / 1,5 %).
  v.qator('jami', () => {
    const c: Qiymat[] = Array(USTUNLAR.length).fill(null);
    c[1] = 'Выполнение к стоимости по смете (договору), %';
    c[8] = foizF('J', 'F', vq, ulush(kaskadLog.H.vsego, kaskadLog.G.vsego));
    c[11] = foizF('M', 'G', vq, ulush(kaskadLog.I.vsego, kaskadLog.G.vsego));
    c[14] = foizF('P', 'G', vq, ulush(kaskadLog.J.vsego, kaskadLog.G.vsego));
    return c;
  });
  }
  // «ИТОГО: 7620061020,12  Семь миллиардов … сум 12 тийин с НДС» — shu oy to'lovi.
  let oyTolov = kaskadLog.J.vsego;
  let oyTolovRef = `${davrUstun}${vq}`;
  const davrDiqqat: Array<{ nom: string; sabab: string }> = [];
  if (o.davrAktlari) {
    /* M12 (egasi qarori): oy to'lovi — har F2 o'z podvali bilan (yadro), smeta podvali kaskadi emas. Har akt alohida qator. */
    v.bosh();
    v.bolim('РАСЧЕТ К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ ПО АКТАМ Ф-2 (накрутка и НДС — по подвалу каждого акта)', { daraja: 0 });
    const ustunSoni = (bir ? USTUNLAR_BIR : USTUNLAR).length;
    const di = davrUstun.charCodeAt(0) - 65;
    const qatorlar: number[] = [];
    for (const a of o.davrAktlari) {
      qatorlar.push(v.qator('oddiy', () => {
        const c: Qiymat[] = Array(ustunSoni).fill(null);
        c[0] = qatorlar.length + 1;
        c[1] = `Акт Ф-2 № ${a.raqam || a.aktId} (${a.hujjatPodvali ? 'подвал документа' : 'подвал сметы'}): прямые ${fmt2(a.ustamasiz)}; с накрутками без НДС ${a.ustamali == null ? 'не определено' : fmt2(a.ustamali)}; НДС ${a.qqs == null ? 'не определено' : fmt2(a.qqs)}`;
        c[di] = a.qqsBilan == null ? null : r2(a.qqsBilan);
        return c;
      }));
    }
    const jami = f3DavrAktlarJami(o.davrAktlari);
    const jq = v.qator('vsego', () => {
      const c: Qiymat[] = Array(ustunSoni).fill(null);
      c[1] = 'ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ ПО АКТАМ Ф-2 (с НДС)';
      c[di] = jami == null ? null : { f: qatorlar.length ? sumRefs(davrUstun, qatorlar) : '0', v: jami };
      return c;
    });
    if (jami == null) davrDiqqat.push({ nom: 'ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ', sabab: 'сумма хотя бы одного акта Ф-2 не определена (проценты подвала неизвестны) — итог оставлен пустым, а не нулевым' });
    else if (oyTolov != null && Math.abs(jami - oyTolov) >= 0.005) {
      davrDiqqat.push({ nom: 'ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ', sabab: `расчет подвала по смете (${fmt2(oyTolov)}) отличается от суммы актов Ф-2 по их собственным подвалам (${fmt2(jami)}); к оплате принята сумма актов Ф-2` });
    }
    oyTolov = jami;
    oyTolovRef = `${davrUstun}${jq}`;
  }
  v.bosh();
  v.blok([
    { c1: 0, c2: 1, matn: 'ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ:', tur: 'qalin' },
    { c1: 2, c2: bir ? 3 : 4, matn: { f: oyTolovRef, v: oyTolov ?? '' }, tur: 'qalin' },
    { c1: bir ? 4 : 5, c2: bir ? 6 : 15, matn: oyTolov == null ? 'не определено — проценты накладных расходов не заданы' : `${summaSozBilan(oyTolov)} с НДС`, tur: 'qalin' },
  ], 20);
  v.narxsizOgoh(f3NarxsizSoni(model, olibTashlanganlar(o.ozgarishlar)));

  // ── Izoh, diqqat, imzo ──
  v.bosh();
  if (bir) {
    v.izoh('Сокращенная (однострочная) форма: перечень видов работ и объемов не приводится. Стоимость выполненных работ — по утвержденным актам формы № 2: графы «с начала строительства» и «в том числе текущего года» — акты, закрытые ДО отчетного месяца; «за отчетный месяц» — акт за отчетный месяц. Сумма без НДС включает накладные и прочие расходы по ставкам объекта; НДС начисляется по ставке, указанной в строке «НДС».');
  } else {
  v.izoh('Графы 8–16 — по УТВЕРЖДЕННЫМ актам формы № 2: графы 8–13 — акты, закрытые ДО отчетного месяца (с начала строительства / в том числе текущего года); графы 14–16 — акт за отчетный месяц (переходит в графы 8–13 в справке следующего месяца). Графы 6–7 — стоимость по утвержденной смете (прямые затраты по разделам); итог к оплате — с транспортными, складскими, прочими расходами, страхованием и НДС по ставкам объекта. График производства работ на текущий год не задан — графы 5 и 7 приняты равными графам 4 и 6.');
  v.izoh('Физические показатели по видам затрат: затраты труда рабочих-строителей — чел.-ч; эксплуатация машин и механизмов — маш.-ч (по утвержденным актам формы № 2).');
  }
  const diqqat = [...model.diqqat, ...davrDiqqat];
  const farqlar: string[] = [];
  for (const c of F3_PUL) {
    const ko = ustunlar.kOplate[c];
    const pod = kaskadLog[c].vsego;
    if (ko != null && pod != null && Math.abs(ko - pod) > 0.005) farqlar.push(`${bir ? BIR_DAVR_NOM[c] : `гр.${VARAQ_USTUN[c]}`}: Σ строк = ${fmt2(ko)}, ИТОГО = ${fmt2(pod)}`);
  }
  if (bir) {
    // NULL ≠ 0: noma'lum yig'ma summa — katak bo'sh, sababi izohda (0 yozilmaydi).
    const nomalum = F3_PUL.filter((c) => kaskadLog[c].vsego == null);
    if (nomalum.length) diqqat.push({ nom: 'ИТОГО К ОПЛАТЕ', sabab: 'сумма не определена (не заданы проценты накладных расходов или НДС) — ячейки оставлены пустыми, а не нулевыми' });
  }
  if (farqlar.length) diqqat.push({ nom: 'ИТОГО К ОПЛАТЕ', sabab: `сумма по строкам и расчет расходятся: ${farqlar.join('; ')}` });
  v.diqqat(diqqatGuruh(diqqat));
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
  const mv = new RasmiyVaraq({
    nom: MANBA_VARAQ,
    sarlavha: 'ИСТОЧНИК ДАННЫХ СПРАВКИ Ф-3: УТВЕРЖДЕННЫЕ АКТЫ ФОРМЫ № 2',
    ostSarlavha: [`по состоянию на ${f3DavrMatni(o.davr)}; графы 8–16 справки берутся из этого листа формулами СУММЕСЛИМН по ключу строки и месяцу`],
    titul: [['Объект:', o.obyektNom]],
    ustunlar: MANBA_USTUNLAR,
    yonalish: 'landscape',
  });
  manba.sort((a, b) => a.kalit - b.kalit || a.oy - b.oy || a.vid.localeCompare(b.vid));
  for (const x of manba) mv.qator('oddiy', () => [x.kalit, x.vid, x.akt, x.oy, x.kod, x.nom, x.birlik, x.hajm, x.summa == null ? null : r2(x.summa)]);
  const { bytes } = rasmiyKitob(manba.length ? [v, mv] : [v], { tur: 'f3' });
  return {
    shakl: bir ? 'bir_qatorli' : 'toliq',
    bytes,
    faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: bir ? 'ФОРМА_3_ОДНОСТРОЧНАЯ' : 'ФОРМА_3', davr: o.davr }),
    kat: ustunlar.kat,
    kaskad: kaskadLog,
    vsegoKOplate: Object.fromEntries(F3_PUL.map((c) => [c, kaskadLog[c].vsego])) as Record<F3PulUstun, number | null>,
    oyKOplate: oyTolov ?? null,
    kOplate: ustunlar.kOplate,
    soatlar: {
      ЧЕЛ: { smeta: r2(s.ЧЕЛ.smeta), boshidan: r2(s.ЧЕЛ.boshidan), yildan: r2(s.ЧЕЛ.yildan), davr: r2(s.ЧЕЛ.davr) },
      МАШ: { smeta: r2(s.МАШ.smeta), boshidan: r2(s.МАШ.boshidan), yildan: r2(s.МАШ.yildan), davr: r2(s.МАШ.davr) },
    },
    diqqat,
  };
}

/* ═══════════ F3 — SHARTNOMA DARAJASI (egasi 2026-12-11) ═══════════
 * «F3 shartnoma doirasida ishlashi kerak»: BITTA Forma 3 — shartnomaning barcha obyektlari, bir hujjatda.
 * Har obyekt summasi — O'Z nakrutkasi/podvali bilan (obyektlar kf lari har xil bo'lishi mumkin); F2 aktlar o'z podvalini
 * saqlaydi («за отчетный месяц» — shu obyektning aktlari O'Z podvali bilan, M12 qoidasi), tasdiqlangan F2 summalari o'zgarmaydi.
 * Hisob — yagona yadro (f3Model → f3UstunlarNatijasi → hisob-yadro kaskad); bu yerda faqat obyektlar bo'yicha yig'indi.
 * Har obyektning to'liq (razdel/ish) F3 si obyekt rejimida; shartnoma rejimida — obyekt qatorlari + akt ro'yxati (ikkinchi varaq).
 * NULL ≠ 0: obyekt summasi noma'lum bo'lsa — uning katagi bo'sh, jami ham bo'sh (qisman yig'indi yozilmaydi), sababi diqqatda. */

/** Shartnoma F3 ning bitta obyekti uchun kirish (UI/yuklagich yig'adi; hisob bu yerda). */
export interface Forma3ShartnomaObyekt {
  obyekt_id: number;
  obyektNom: string;
  /** Faqat shu obyekt: nakopitelniy qatorlari + tasdiqlangan F2 oylik summalari (f2Oylik da akt_id bo'lsa — aktlar filtri ishlaydi). */
  manba: Forma3Manba;
  /** Shu obyektning O'Z nakrutka foizlari / meros izohi / maxsus podvali / НДС stavkasi. */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  nkManba?: string | null;
  podval?: Podval | null;
  ndsFoiz?: number | null;
  ozgarishlar?: Forma3ExportOptions['ozgarishlar'];
  /** Hisobot oyining shu obyekt aktlari — har biri O'Z F2 podvali bilan (f2AktBaho). */
  davrAktlari?: ReadonlyArray<F3DavrAkt>;
}

export interface Forma3ShartnomaOptions {
  /** Hisobot davri «YYYY-MM». */
  davr: string;
  shartnomaRaqam: string;
  shartnomaNom?: string | null;
  shartnomaSana?: string | null;
  shartnomaSumma?: number | null;
  raqam?: string | null;
  hujjatSana?: string | null;
  imzo?: ImzoNomlar;
  pudratchi?: Forma3Rekvizit | null;
  zakazchik?: Forma3Rekvizit | null;
}

/** Bitta pul ustuni, bitta obyekt: ustamasiz (прямые), ustamali (ИТОГО-4, NDS siz), NDS, NDS bilan. null — noma'lum. */
export type F3ShartnomaSumma = { pryamye: number; itogo4: number | null; qqs: number | null; vsego: number | null };

export interface F3ShartnomaObyektNatija {
  obyekt_id: number;
  nom: string;
  ndsFoiz: number | null;
  ustun: Record<F3PulUstun, F3ShartnomaSumma>;
  aktlar: ReadonlyArray<F3DavrAkt>;
  diqqat: Array<{ nom: string; sabab: string }>;
}

export interface F3ShartnomaYigindi {
  obyektlar: F3ShartnomaObyektNatija[];
  /** Shartnoma jami (barcha obyektlar). Birorta obyekt noma'lum bo'lsa — shu maydon null (NULL ≠ 0). */
  jami: Record<F3PulUstun, F3ShartnomaSumma>;
  diqqat: Array<{ nom: string; sabab: string }>;
}

/** Hisobot oyiga tegishli, TANLANMAGAN aktlar summasini manbadan chiqaradi (ro'yxatdan olib tashlangan F2 davr ustuniga kirmaydi). */
export function f3AktlarniFiltrla(m: Forma3Manba, davr: string, tanlangan: ReadonlySet<number> | null | undefined): Forma3Manba {
  if (!tanlangan) return m;
  const olib = (r: { oy: string; akt_id?: number }) => r.oy === davr && r.akt_id != null && !tanlangan.has(r.akt_id);
  return { ...m, f2Oylik: m.f2Oylik.filter((r) => !olib(r)) };
}

const nolSumma = (): F3ShartnomaSumma => ({ pryamye: 0, itogo4: 0, qqs: 0, vsego: 0 });
const qoshSumma = (a: F3ShartnomaSumma, b: F3ShartnomaSumma): F3ShartnomaSumma => ({
  pryamye: yaxlit2(a.pryamye + b.pryamye),
  itogo4: a.itogo4 == null || b.itogo4 == null ? null : yaxlit2(a.itogo4 + b.itogo4),
  qqs: a.qqs == null || b.qqs == null ? null : yaxlit2(a.qqs + b.qqs),
  vsego: a.vsego == null || b.vsego == null ? null : yaxlit2(a.vsego + b.vsego),
});

/**
 * Shartnoma F3 hisobi (toza). Har obyekt — o'z nakrutka/podvali (`f3UstunlarNatijasi`), davr ustuni (J) — aktlar o'z podvali bilan
 * (davrAktlari berilsa), so'ng obyektlar bo'yicha yig'indi. Nakrutka foizlari yo'q obyekt — summalari null (0 emas).
 */
export function f3ShartnomaYigish(obyektlar: ReadonlyArray<Forma3ShartnomaObyekt>, davr: string): F3ShartnomaYigindi {
  const natija: F3ShartnomaObyektNatija[] = [];
  const diqqat: Array<{ nom: string; sabab: string }> = [];
  for (const ob of obyektlar) {
    const manba: Forma3Manba = { ...ob.manba, nakopitelniy: ob.manba.nakopitelniy.filter((x) => x.obyekt_id === ob.obyekt_id) };
    const model = f3Model(manba, { davr, ozgarishlar: ob.ozgarishlar, asosiyObyektId: ob.obyekt_id });
    const rows = f3ModelQatorlar(model);
    const idx = f3QiymatIndekslar(rows);
    const nk: Partial<NakrutkaKoeffitsientlar> = { ...(ob.nakrutka ?? {}) };
    if (ob.ndsFoiz != null && Number.isFinite(ob.ndsFoiz) && ob.ndsFoiz >= 0) nk.НДС = ob.ndsFoiz;
    const nkYoq = !ob.nakrutka || !Object.keys(ob.nakrutka).length;
    const podval = ob.podval ? serverMerosKoefQoy(ob.podval, nk, ob.nkManba) : null;
    const u = f3UstunlarNatijasi(rows, idx, nk, podval);
    const od: Array<{ nom: string; sabab: string }> = model.diqqat.map((d) => ({ nom: `${ob.obyektNom}: ${d.nom}`, sabab: d.sabab }));
    if (nkYoq) od.push({ nom: ob.obyektNom, sabab: 'проценты накладных и прочих расходов не заданы для объекта — стоимость к оплате не определена (не принимаются равными 0)' });
    const ustun = {} as Record<F3PulUstun, F3ShartnomaSumma>;
    for (const c of F3_PUL) {
      const k = u.kaskad[c];
      ustun[c] = nkYoq ? { pryamye: k.pryamye, itogo4: null, qqs: null, vsego: null } : { pryamye: k.pryamye, itogo4: k.itogo4, qqs: k.qqs, vsego: k.vsego };
    }
    const aktlar = ob.davrAktlari ?? [];
    if (ob.davrAktlari && aktlar.length) {
      // M12: «за отчетный месяц» — har akt O'Z podvali (F2 hujjati ВСЕГО) yig'indisi.
      let itogo4: number | null = 0, qqs: number | null = 0, vsego: number | null = 0, pr = 0;
      for (const a of aktlar) {
        pr += a.ustamasiz;
        itogo4 = itogo4 == null || a.ustamali == null ? null : itogo4 + a.ustamali;
        qqs = qqs == null || a.qqs == null ? null : qqs + a.qqs;
        vsego = vsego == null || a.qqsBilan == null ? null : vsego + a.qqsBilan;
      }
      ustun.J = { pryamye: yaxlit2(pr), itogo4: itogo4 == null ? null : yaxlit2(itogo4), qqs: qqs == null ? null : yaxlit2(qqs), vsego: vsego == null ? null : yaxlit2(vsego) };
      if (ustun.J.vsego == null) od.push({ nom: ob.obyektNom, sabab: 'сумма хотя бы одного акта Ф-2 не определена (проценты подвала неизвестны) — итог по объекту оставлен пустым, а не нулевым' });
    }
    const ndsFoiz = (podval ? podvalNdsFoizi(podval) : null) ?? (nk.НДС ?? null);
    natija.push({ obyekt_id: ob.obyekt_id, nom: ob.obyektNom, ndsFoiz, ustun, aktlar, diqqat: od });
    diqqat.push(...od);
  }
  const jami = {} as Record<F3PulUstun, F3ShartnomaSumma>;
  for (const c of F3_PUL) jami[c] = natija.reduce((s, o) => qoshSumma(s, o.ustun[c]), nolSumma());
  if (F3_PUL.some((c) => jami[c].vsego == null)) {
    diqqat.push({ nom: 'ИТОГО ПО ДОГОВОРУ', sabab: 'сумма по договору не определена — у части объектов нет процентов накладных расходов или актов без подвала; итог оставлен пустым, а не частичным' });
  }
  return { obyektlar: natija, jami, diqqat };
}

export interface Forma3ShartnomaNatija {
  bytes: Uint8Array;
  faylNomi: string;
  yigindi: F3ShartnomaYigindi;
  /** ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ (QQS bilan) va uning so'zlarda yozilishi (propis). */
  oyKOplate: number | null;
  propis: string | null;
  diqqat: Array<{ nom: string; sabab: string }>;
}

const SH_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Наименование объекта', kenglik: 50, tur: 'matn' },
  { sarlavha: 'Акты Ф-2 за месяц', kenglik: 12, tur: 'birlik' },
  { sarlavha: 'Ставка НДС, %', kenglik: 10, tur: 'birlik' },
  { sarlavha: 'Стоимость по смете (договору)', kenglik: 20, tur: 'pul' },
  { sarlavha: 'с начала строительства (до отчетного месяца)', kenglik: 20, tur: 'pul', guruh: 'ВЫПОЛНЕННЫЕ РАБОТЫ (ПОНЕСЕННЫЕ ЗАТРАТЫ), сум' },
  { sarlavha: 'в том числе текущего года (до отчетного месяца)', kenglik: 20, tur: 'pul', guruh: 'ВЫПОЛНЕННЫЕ РАБОТЫ (ПОНЕСЕННЫЕ ЗАТРАТЫ), сум' },
  { sarlavha: 'за отчетный месяц', kenglik: 20, tur: 'pul', guruh: 'ВЫПОЛНЕННЫЕ РАБОТЫ (ПОНЕСЕННЫЕ ЗАТРАТЫ), сум' },
];
/** Mantiqiy pul ustuni → varaq harfi (E..H). */
const SH_HARF: Record<F3PulUstun, string> = { G: 'E', H: 'F', I: 'G', J: 'H' };
const SH_AKT_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Объект', kenglik: 44, tur: 'matn' },
  { sarlavha: 'Акт Ф-2', kenglik: 14, tur: 'kod' },
  { sarlavha: 'Подвал', kenglik: 14, tur: 'birlik' },
  { sarlavha: 'Прямые затраты (без накруток)', kenglik: 20, tur: 'pul' },
  { sarlavha: 'С накрутками, без НДС', kenglik: 20, tur: 'pul' },
  { sarlavha: 'НДС', kenglik: 18, tur: 'pul' },
  { sarlavha: 'Всего с НДС', kenglik: 20, tur: 'pul' },
];

/**
 * Shartnoma darajasidagi Форма № 3 (Excel): har obyekt — bitta qator (o'z nakrutkasi bilan), shartnoma jami, NDS, ВСЕГО К ОПЛАТЕ,
 * oy jami so'zlarda, imzolar; 2-varaq — hujjatga kirgan F2 aktlar (o'z podvali bilan). Jonli formulalar: jami = obyekt qatorlari yig'indisi.
 */
export function forma3ShartnomaHujjat(obyektlar: ReadonlyArray<Forma3ShartnomaObyekt>, o: Forma3ShartnomaOptions): Forma3ShartnomaNatija {
  const y = f3ShartnomaYigish(obyektlar, o.davr);
  const r2 = (x: number) => yaxlit2(x);
  const sanaMatni = (iso: string | null | undefined): string | null => {
    const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return x ? `${x[3]}.${x[2]}.${x[1]} г.` : null;
  };
  const dm = /^(\d{4})-(\d{2})$/.exec(o.davr || '');
  const davrOraligi = dm ? { boshi: `01.${dm[2]}.${dm[1]} г.`, oxiri: `${String(new Date(Number(dm[1]), Number(dm[2]), 0).getDate()).padStart(2, '0')}.${dm[2]}.${dm[1]} г.` } : null;
  const oyMatni = dm ? `ЗА ${OYLAR_KATTA[Number(dm[2]) - 1]} МЕСЯЦ ${dm[1]} ГОДА` : `ЗА ОТЧЕТНЫЙ ПЕРИОД ${f3DavrMatni(o.davr)}`;
  const pud = o.pudratchi ?? {};
  const zak = o.zakazchik ?? {};
  const diqqat = [...y.diqqat];
  if (!zak.toliqNom && !o.imzo?.zakazchik) diqqat.push({ nom: 'Заказчик', sabab: 'реквизиты заказчика не заданы — строки заказчика оставлены для заполнения' });
  const dogovorMatn = `№ ${raqamTozala(o.shartnomaRaqam)}${o.shartnomaNom ? ` (${o.shartnomaNom})` : ''}${sanaMatni(o.shartnomaSana) ? ` от ${sanaMatni(o.shartnomaSana)}` : ''}${o.shartnomaSumma != null ? `. Общая стоимость в договорных текущих ценах: ${fmt2(o.shartnomaSumma)} сум` : ''}`;
  const sana = sanaMatni(o.hujjatSana) ?? sanaMatni(bugunSana()) ?? '';

  const v = new RasmiyVaraq({
    nom: 'Форма № 3 (договор)',
    sarlavha: 'СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (ПОНЕСЕННЫХ ЗАТРАТ) ПО ДОГОВОРУ',
    ostSarlavha: [oyMatni],
    oldBloklar: [
      [{ c1: 0, c2: 1, matn: 'Номер документа', tur: 'qutiQalin' }, { c1: 2, c2: 3, matn: 'Дата составления', tur: 'qutiQalin' }, { c1: 4, c2: 7, matn: 'Отчетный период', tur: 'qutiQalin' }],
      [{ c1: 0, c2: 1, matn: '', tur: 'quti' }, { c1: 2, c2: 3, matn: '', tur: 'quti' }, { c1: 4, c2: 5, matn: 'с', tur: 'quti' }, { c1: 6, c2: 7, matn: 'по', tur: 'quti' }],
      [{ c1: 0, c2: 1, matn: o.raqam ?? '', tur: 'quti' }, { c1: 2, c2: 3, matn: sana, tur: 'quti' }, { c1: 4, c2: 5, matn: davrOraligi?.boshi ?? '', tur: 'quti' }, { c1: 6, c2: 7, matn: davrOraligi?.oxiri ?? '', tur: 'quti' }],
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
      ['Договор', dogovorMatn],
      ['Объекты договора:', `${y.obyektlar.length} шт.: ${y.obyektlar.map((x) => x.nom).join('; ')}`],
    ],
    ustunlar: SH_USTUNLAR,
    yonalish: 'landscape',
  });

  const col = (L: string) => L.charCodeAt(0) - 65;
  const pulUstunlar = (fill: (c: F3PulUstun, L: string) => Qiymat): Qiymat[] => {
    const out: Qiymat[] = Array(SH_USTUNLAR.length).fill(null);
    for (const c of F3_PUL) out[col(SH_HARF[c])] = fill(c, SH_HARF[c]);
    return out;
  };
  const obyektQatorlar: number[] = [];
  y.obyektlar.forEach((ob, i) => {
    const q = v.qator('oddiy', () => {
      const out = pulUstunlar((c) => (ob.ustun[c].itogo4 == null ? null : r2(ob.ustun[c].itogo4!)));
      out[0] = i + 1; out[1] = ob.nom; out[2] = ob.aktlar.length ? String(ob.aktlar.length) : '—';
      out[3] = ob.ndsFoiz == null ? null : { n: ob.ndsFoiz, uslub: 'foiz' };
      return out;
    });
    obyektQatorlar.push(q);
  });
  const bezQ = v.qator('jami', () => {
    const out = pulUstunlar((c, L) => (y.jami[c].itogo4 == null ? null : { f: obyektQatorlar.length ? sumRefs(L, obyektQatorlar) : '0', v: r2(y.jami[c].itogo4!) }));
    out[1] = 'ИТОГО ПО ДОГОВОРУ БЕЗ НДС (с накрутками объектов)';
    return out;
  });
  // НДС — obyektlar bo'yicha yig'indi (stavkalar obyektlarda farq qilishi mumkin) — qiymat, formula emas.
  const ndsQ = v.qator('oddiy', () => {
    const out = pulUstunlar((c) => (y.jami[c].qqs == null ? null : r2(y.jami[c].qqs!)));
    out[1] = 'НДС (сумма по объектам, по ставкам каждого объекта)';
    return out;
  });
  const vsegoQ = v.qator('vsego', () => {
    const out = pulUstunlar((c, L) => {
      const t = y.jami[c];
      if (t.vsego == null) return null;
      return t.itogo4 != null && t.qqs != null && r2(t.itogo4 + t.qqs) === t.vsego ? { f: `${L}${bezQ}+${L}${ndsQ}`, v: r2(t.vsego) } : r2(t.vsego);
    });
    out[1] = 'ВСЕГО К ОПЛАТЕ ПО ДОГОВОРУ (С УЧЕТОМ НДС)';
    return out;
  });
  v.qator('oddiy', () => {
    const out = pulUstunlar((c) => r2(y.jami[c].pryamye));
    out[1] = 'в том числе прямые затраты (без накруток и НДС)';
    return out;
  });
  const oyTolov = y.jami.J.vsego;
  const propis = oyTolov == null ? null : `${summaSozBilan(oyTolov)} с НДС`;
  v.bosh();
  v.blok([
    { c1: 0, c2: 1, matn: 'ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ:', tur: 'qalin' },
    { c1: 2, c2: 3, matn: { f: `${SH_HARF.J}${vsegoQ}`, v: oyTolov ?? '' }, tur: 'qalin' },
    { c1: 4, c2: 7, matn: propis ?? 'не определено — проценты накладных расходов не заданы или суммы актов не определены', tur: 'qalin' },
  ], 20);
  const narxsiz = obyektlar.reduce((s, ob) => {
    const model = f3Model({ ...ob.manba, nakopitelniy: ob.manba.nakopitelniy.filter((x) => x.obyekt_id === ob.obyekt_id) }, { davr: o.davr, ozgarishlar: ob.ozgarishlar, asosiyObyektId: ob.obyekt_id });
    return s + f3NarxsizSoni(model, olibTashlanganlar(ob.ozgarishlar));
  }, 0);
  v.narxsizOgoh(narxsiz);
  v.bosh();
  v.izoh('Справка составлена по договору в целом: по одной строке на объект. Стоимость каждого объекта — по его утвержденным актам формы № 2 с накрутками и ставкой НДС ЭТОГО объекта (проценты у объектов могут различаться); «за отчетный месяц» — сумма актов Ф-2 по их собственным подвалам. Графы «с начала строительства» и «в том числе текущего года» — акты, закрытые ДО отчетного месяца. Утвержденные суммы Ф-2 не изменяются. Подробная справка по каждому объекту (разделы и виды работ) формируется в режиме «Объект».');
  v.diqqat(diqqatGuruh(diqqat));
  v.bosh();
  const imzoQator = (rol: string, nom?: string | null) => {
    v.blok([
      { c1: 0, c2: 1, matn: rol, tur: 'imzo' }, { c1: 2, c2: 4, matn: '____________________', tur: 'imzo' },
      { c1: 5, c2: 6, matn: nom?.trim() || 'Ф.И.О. ____________________', tur: 'imzo' },
    ], 22);
    v.blok([{ c1: 2, c2: 4, matn: '(подпись)', tur: 'izoh' }]);
  };
  v.blok([{ c1: 0, c2: 6, matn: `ПОДРЯДЧИК:  ${pud.toliqNom ?? o.imzo?.pudratchi ?? ''}`.trim(), tur: 'qalin' }]);
  imzoQator('Руководитель', null);
  imzoQator('Главный бухгалтер', null);
  v.blok([{ c1: 0, c2: 1, matn: 'М.П.', tur: 'izoh' }]);
  v.bosh();
  v.blok([{ c1: 0, c2: 6, matn: `ЗАКАЗЧИК:  ${zak.toliqNom ?? o.imzo?.zakazchik ?? ''}`.trim(), tur: 'qalin' }]);
  imzoQator('Руководитель', null);
  imzoQator('Главный бухгалтер', null);
  v.blok([{ c1: 0, c2: 1, matn: 'М.П.', tur: 'izoh' }]);

  // 2-varaq: hujjatga kirgan F2 aktlar (o'z podvali bilan).
  const av = new RasmiyVaraq({
    nom: 'Акты Ф-2 (в справке)',
    sarlavha: 'АКТЫ ФОРМЫ № 2, ВОШЕДШИЕ В СПРАВКУ ПО ДОГОВОРУ',
    ostSarlavha: [`за отчетный месяц ${f3DavrMatni(o.davr)}; каждый акт — по собственному подвалу`],
    titul: [['Договор', dogovorMatn]],
    ustunlar: SH_AKT_USTUNLAR,
    yonalish: 'landscape',
  });
  const aktQ: number[] = [];
  let n = 0;
  for (const ob of y.obyektlar) for (const a of ob.aktlar) {
    n++;
    aktQ.push(av.qator('oddiy', () => [n, ob.nom, a.raqam || String(a.aktId), a.hujjatPodvali ? 'документа' : 'сметы', r2(a.ustamasiz),
      a.ustamali == null ? null : r2(a.ustamali), a.qqs == null ? null : r2(a.qqs), a.qqsBilan == null ? null : r2(a.qqsBilan)]));
  }
  if (aktQ.length) {
    const jamiAkt = f3DavrAktlarJami(y.obyektlar.flatMap((x) => x.aktlar));
    av.qator('vsego', () => ['', 'ИТОГО ПО АКТАМ Ф-2', '', '', { f: sumRefs('E', aktQ), v: r2(y.obyektlar.flatMap((x) => x.aktlar).reduce((s, a) => s + a.ustamasiz, 0)) },
      null, null, jamiAkt == null ? null : { f: sumRefs('H', aktQ), v: jamiAkt }]);
  } else {
    av.izoh('В отчетном месяце нет утвержденных актов Ф-2, включенных в справку.');
  }
  const { bytes } = rasmiyKitob(aktQ.length ? [v, av] : [v], { tur: 'f3' });
  return {
    bytes,
    faylNomi: hujjatFaylNomi({ obyekt: `Договор_${o.shartnomaRaqam}`, hujjat: 'ФОРМА_3_ПО_ДОГОВОРУ', davr: o.davr }),
    yigindi: y,
    oyKOplate: oyTolov,
    propis,
    diqqat,
  };
}

/* ═══════════ F3 — SOTUV SUMMASIDAN (egasi qoidasi 2026-10-23) ═══════════
 * F3 = akt-sverkadagi har «Продажа» summasi (t2_forma3.manba='sotuv'); F2 qatorlari bilan bog'lash talab qilinmaydi.
 * Summa QQS bilan; QQSsiz = ROUND(summa / (1 + НДС), 2), НДС = summa − QQSsiz. Hisob — `nakopitelniy-svod.ts`. */
const F3_SOTUV_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Наименование', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Сметная (договорная) стоимость', kenglik: 18, tur: 'pul' },
  { sarlavha: 'с начала строительства', kenglik: 18, tur: 'pul', guruh: 'СТОИМОСТЬ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ' },
  { sarlavha: 'с начала года', kenglik: 18, tur: 'pul', guruh: 'СТОИМОСТЬ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ' },
  { sarlavha: 'за отчётный период', kenglik: 18, tur: 'pul', guruh: 'СТОИМОСТЬ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ' },
];
const sanaRuF3 = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('.') : '—');

/** «Bir qatorli» sotuv F3 ustunlari: № | Наименование | Ставка | за отчётный период. */
const F3_SOTUV_BIR_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Наименование', kenglik: 58, tur: 'matn' },
  { sarlavha: 'Ставка, %', kenglik: 10, tur: 'birlik' },
  { sarlavha: 'за отчётный период, сум', kenglik: 22, tur: 'pul' },
];

/** Avtomatik (saqlanmagan) F3 belgisi — sarlavhada, fayl nomida va MUNDARIJA da (egasi 2026-11-05). */
export const F3_AVTO_BELGI = 'Ф3 (автоматически по Ф-2, не сохранён)';

export function forma3SotuvdanXlsx(sh: SvodShartnoma, f3Id: number, o: {
  tashkilot?: string | null; imzo?: ImzoNomlar; shakl?: Forma3Shakl;
  /** Saqlanmagan F3 (oylik paket: oy F2 laridan). `izoh` — hujjat izohi (manba va yetishmagan rekvizitlar). */
  avto?: { izoh: readonly string[] } | null;
} = {}): { bytes: Uint8Array; faylNomi: string } | null {
  const h = f3SotuvdanHisobla(sh, f3Id);
  if (!h) return null;
  const avto = o.avto ?? null;
  const raqamQ = avto ? F3_AVTO_BELGI : `Документ № ${h.f3.raqam ?? '—'} от ${sanaRuF3(h.f3.sotuv_sana)}`;
  const avtoIzoh = (v: RasmiyVaraq) => { if (avto) for (const s of avto.izoh) v.izoh(s); };
  const avtoNom = (asl: string) => (avto ? `Ф3_АВТО_ПО_Ф-2${asl.includes('ОДНОСТРОЧНАЯ') ? '_ОДНОСТРОЧНАЯ' : ''}` : asl);
  const nds = h.f3.nds_foiz ?? F3_NDS_SUKUT;
  if (o.shakl === 'bir_qatorli') {
    // Bitta yig'ma qator + podval; summalar to'liq shakl bilan BIR XIL (`h.davr`: NDS siz, NDS, NDS bilan — tiyingacha).
    const vb = new RasmiyVaraq({
      nom: 'Форма 3', kattaHarf: false,
      sarlavha: `СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ (ФОРМА № 3)${avto ? ' — ' + F3_AVTO_BELGI.toUpperCase() : ''}`,
      ostSarlavha: [raqamQ, `Отчётный период: с ${sanaRuF3(h.davrBoshi)} по ${sanaRuF3(h.davrOxiri)}`],
      titul: [['Подрядчик:', o.tashkilot ?? null], ['Договор:', `№ ${raqamTozala(sh.raqam)}${sh.nom ? ` (${sh.nom})` : ''}`], ['Объекты:', sh.obyektlar.map((x) => x.nom).join(', ') || null]],
      ustunlar: F3_SOTUV_BIR_USTUN, yonalish: 'landscape',
    });
    const objNom = sh.obyektlar.map((x) => x.nom).join(', ');
    const satr = vb.qator('oddiy', [1, `Выполненные строительно-монтажные работы${objNom ? ` по объекту ${objNom}` : ` по договору № ${raqamTozala(sh.raqam)}`} за период с ${sanaRuF3(h.davrBoshi)} по ${sanaRuF3(h.davrOxiri)}`, null, somga(h.davr[0])]);
    const bez = vb.qator('jami', ['', 'СУММА БЕЗ НДС', null, { f: `D${satr}`, v: somga(h.davr[0]) }]);
    // НДС sotuv summasidan AJRATILGAN (jami − NDS siz) — to'liq shakldagi kabi qiymat, formula emas.
    const ndsQ = vb.qator('oddiy', ['', 'НДС', { n: nds, uslub: 'foiz' }, somga(h.davr[1])]);
    vb.qator('vsego', ['', 'ВСЕГО К ОПЛАТЕ (с НДС)', null, { f: `D${bez}+D${ndsQ}`, v: somga(h.davr[2]) }]);
    vb.bosh();
    vb.izoh(avto ? `Сокращенная (однострочная) форма: перечень видов работ и объемов не приводится. НДС выделен из суммы с НДС (ставка ${nds}%).` : `Сокращенная (однострочная) форма: перечень видов работ и объемов не приводится. Сумма за отчётный период равна сумме реализации от ${sanaRuF3(h.f3.sotuv_sana)}; НДС выделен из суммы с НДС (ставка ${nds}%).`);
    avtoIzoh(vb);
    vb.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК'], o.imzo));
    const { bytes } = rasmiyKitob([vb], { tur: 'f3' });
    return { bytes, faylNomi: hujjatFaylNomi({ obyekt: `№${raqamTozala(sh.raqam)}`, hujjat: avtoNom(`Ф3_ОДНОСТРОЧНАЯ_${h.f3.raqam ?? h.f3.id}`), davr: h.f3.sotuv_sana }) };
  }
  const v = new RasmiyVaraq({
    nom: 'Форма 3', kattaHarf: false,
    sarlavha: `СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ (ФОРМА № 3)${avto ? ' — ' + F3_AVTO_BELGI.toUpperCase() : ''}`,
    ostSarlavha: [raqamQ, `Отчётный период: с ${sanaRuF3(h.davrBoshi)} по ${sanaRuF3(h.davrOxiri)}`],
    titul: [['Подрядчик:', o.tashkilot ?? null], ['Договор:', `№ ${raqamTozala(sh.raqam)}${sh.nom ? ` (${sh.nom})` : ''}`], ['Объекты:', sh.obyektlar.map((x) => x.nom).join(', ') || null]],
    ustunlar: F3_SOTUV_USTUN, yonalish: 'landscape',
  });
  const shT = h.shartnoma;
  const shSiz = shT == null ? null : qqsAjratTiyin(shT, nds)[0];
  const r1 = v.qator('oddiy', [1, 'Стоимость выполненных работ и затрат без НДС', shSiz == null ? null : somga(shSiz), somga(h.boshidan[0]), somga(h.yilBoshidan[0]), somga(h.davr[0])]);
  const r2 = v.qator('oddiy', [2, `НДС ${nds}%`, shT == null || shSiz == null ? null : somga(shT - shSiz), somga(h.boshidan[1]), somga(h.yilBoshidan[1]), somga(h.davr[1])]);
  const harf = (i: number) => v.harf(i);
  const jamiF = (c: number, val: number | null): Qiymat => (val == null ? null : { f: `${harf(c)}${r1}+${harf(c)}${r2}`, v: somga(val) });
  v.qator('vsego', ['', 'ВСЕГО с НДС', jamiF(2, shT), jamiF(3, h.boshidan[2]), jamiF(4, h.yilBoshidan[2]), jamiF(5, h.davr[2])]);
  v.bosh();
  v.izoh(avto ? `НДС выделен из суммы с НДС (ставка ${nds}%).` : `Сумма за отчётный период равна сумме реализации от ${sanaRuF3(h.f3.sotuv_sana)}; НДС выделен из суммы с НДС (ставка ${nds}%).`);
  avtoIzoh(v);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'f3' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: `№${raqamTozala(sh.raqam)}`, hujjat: avtoNom(`Ф3_${h.f3.raqam ?? h.f3.id}`), davr: h.f3.sotuv_sana }) };
}
