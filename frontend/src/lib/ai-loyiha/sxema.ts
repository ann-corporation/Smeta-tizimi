/**
 * AI LOYIHA O'QISH — loyiha chizmasidan (КЖ / АС / АР varaqlari) ajratilgan elementlar sxemasi.
 *
 * Toza modul: brauzer, Pages Function va testlar uchun bir xil. AI javobi HAQIQAT EMAS — u
 * `validator.ts` dan o'tadi, keyin `kesishma.ts` (spetsifikatsiya ↔ geometriya) tekshiruvidan.
 * `null` — chizmada topilmagan / o'qilmagan qiymat; hech qachon 0 bilan almashtirilmaydi.
 *
 * Kontrakt: docs/architecture/AI_LOYIHA_OQISH.md
 */

/** Prompt/sxema versiyasi — keshlash kaliti qismi: versiya o'zgarsa eski kesh qayta ishlatilmaydi. */
export const AI_LOYIHA_VERSIYA = 'ai-loyiha-v1';

export const VARAQ_TURLARI = ['KJ', 'AS', 'AR', 'boshqa'] as const;
export type VaraqTuri = (typeof VARAQ_TURLARI)[number];

export const ELEMENT_TURLARI = [
  'fundament_stakan', // stakan tipidagi alohida poydevor (ustun ostida — umumiy tayanch)
  'fundament_lenta', // tasma (lenta) poydevor / rostverk
  'fundament_plita',
  'ustun', // ustun / stoyka (ikki oraliq uchun umumiy)
  'tusin', // to'sin / progon / rigel
  'toldirma', // to'ldirma: panjara, list, setka
  'devor',
  'plita',
  'armatura',
  'beton',
  'qoplama', // granit / qoplama
  'profil', // boshqa metall profil
  'boshqa',
] as const;
export type ElementTuri = (typeof ELEMENT_TURLARI)[number];

/** Kanonik birliklar. `m` — uzunlik va p.m (пог. м) uchun bitta birlik. */
export const BIRLIKLAR = ['m', 'm2', 'm3', 'kg', 't', 'dona'] as const;
export type Birlik = (typeof BIRLIKLAR)[number];

/**
 * Qiymat qaysi doiraga tegishli: butun obyekt; bitta oraliq (masalan «спецификация на 3 м»);
 * bitta dona (bitta element o'lchami).
 */
export const DOIRALAR = ['jami', 'bir_oraliq', 'bir_dona'] as const;
export type Doira = (typeof DOIRALAR)[number];

export type ElementManba = {
  /** Varaq shifri / raqami (masalan «КЖ-2», «Лист 3»). Himoya uchun — egasi raqamni shu varaqdan ko'rsatadi. */
  varaq: string | null;
  /** PDF sahifa raqami (1 dan). */
  sahifa: number;
  /** Spetsifikatsiya pozitsiyasi / qator raqami / marka belgisi. */
  pozitsiya: string | null;
  /** Qiymat spetsifikatsiya jadvalidan (true) yoki chizma geometriyasidan (false) olingan. */
  jadvaldan: boolean;
};

export type LoyihaElement = {
  /** Barqaror id (`{hujjat}:s{sahifa}-e{n}`) — validator beradi; bir nechta fayl birga bo'lsa ham noyob. */
  id: string;
  marka: string | null;
  tur: ElementTuri;
  nom: string;
  /** Kesim/profil yozuvi chizmadagidek: «□80×80×4», «0,3×0,5». */
  kesim: string | null;
  /** O'lchamlar metrda (eni × bo'yi × balandligi), chizmada bo'lsa. */
  olcham_m: number[] | null;
  /** Bitta elementning uzunligi, m. */
  uzunlik_m: number | null;
  /** Dona soni (doira bo'yicha). */
  soni: number | null;
  /** Hajm/miqdor `birlik` da (doira bo'yicha). */
  miqdor: number | null;
  birlik: Birlik | null;
  /** Bitta dona massasi, kg (metall spetsifikatsiyasi). */
  birlik_massa_kg: number | null;
  doira: Doira;
  /**
   * Element umumiy tayanchga tegishli (ustun, uning stakani/poydevori, закладная деталь, анкер, каркас стакана):
   * ikki qo'shni oraliq uchun bitta. Oraliq spetsifikatsiyasida bunday element 2 marta sanalishi mumkin.
   */
  tayanchga_tegishli: boolean;
  /** Yig'ma birlik markasi (С-4, ЗД-3, КП-2), agar qator uning tarkibi bo'lsa: qiymat BITTA yig'ma birlik uchun. */
  ota_marka: string | null;
  manba: ElementManba;
  /** Model o'zi bergan ishonch 0..1. Yakuniy ishonchni kesishma tekshiruvi pasaytirishi mumkin. */
  ishonch: number;
  izoh: string | null;
};

/** Varaqdagi umumiy geometrik parametrlar — kesishma tekshiruvining asosi. */
export type VaraqParametrlari = {
  /** Plandagi umumiy uzunlik (devor/to'siq o'qi bo'yicha), m. */
  uzunlik_m: number | null;
  /** Tayanchlar (ustun/stakan o'qlari 1–2) orasidagi masofa, m. Panjara/prut qadami EMAS. */
  qadam_m: number | null;
  /** Varaqda aniq yozilgan oraliq/seksiya soni (masalan «Ограждение ОГ-5 — N шт»). */
  oraliq_soni: number | null;
  /** Yopiq kontur (oxirgi tayanch birinchisi bilan bir) — true; ochiq chiziq — false; noma'lum — null. */
  yopiq_kontur: boolean | null;
  /** Balandlik belgilari, m (masalan +0,200 … +2,200). */
  belgi_past_m: number | null;
  belgi_yuqori_m: number | null;
};

export type VaraqMalumot = {
  shifr: string | null;
  nomi: string | null;
  turi: VaraqTuri;
  masshtab: string | null;
};

export type SahifaNatija = {
  /** Fayl belgisi (sha256 boshi) — bir nechta PDF birga tekshirilganda id lar to'qnashmasin. */
  hujjat: string | null;
  sahifa: number;
  varaq: VaraqMalumot;
  parametrlar: VaraqParametrlari;
  elementlar: LoyihaElement[];
  /** Model ko'rgan, lekin sxemaga sig'magan muhim izohlar (masalan «размеры уточнить по месту»). */
  ogohlantirishlar: string[];
};

const raqamYokiNull = { type: ['number', 'null'] } as const;
const matnYokiNull = { type: ['string', 'null'] } as const;

/** OpenRouter/OpenAI strict Structured Outputs uchun JSON Schema (hamma maydon required, null — noma'lum). */
export const AI_LOYIHA_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['varaq', 'parametrlar', 'elementlar', 'ogohlantirishlar'],
  properties: {
    varaq: {
      type: 'object',
      additionalProperties: false,
      required: ['shifr', 'nomi', 'turi', 'masshtab'],
      properties: { shifr: matnYokiNull, nomi: matnYokiNull, turi: { type: 'string', enum: [...VARAQ_TURLARI] }, masshtab: matnYokiNull },
    },
    parametrlar: {
      type: 'object',
      additionalProperties: false,
      required: ['uzunlik_m', 'qadam_m', 'oraliq_soni', 'yopiq_kontur', 'belgi_past_m', 'belgi_yuqori_m'],
      properties: {
        uzunlik_m: raqamYokiNull,
        qadam_m: raqamYokiNull,
        oraliq_soni: raqamYokiNull,
        yopiq_kontur: { type: ['boolean', 'null'] },
        belgi_past_m: raqamYokiNull,
        belgi_yuqori_m: raqamYokiNull,
      },
    },
    elementlar: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['marka', 'tur', 'nom', 'kesim', 'olcham_m', 'uzunlik_m', 'soni', 'miqdor', 'birlik', 'birlik_massa_kg', 'doira', 'tayanchga_tegishli', 'ota_marka', 'varaq', 'pozitsiya', 'jadvaldan', 'ishonch', 'izoh'],
        properties: {
          marka: matnYokiNull,
          tur: { type: 'string', enum: [...ELEMENT_TURLARI] },
          nom: { type: 'string' },
          kesim: matnYokiNull,
          olcham_m: { type: ['array', 'null'], items: { type: 'number' } },
          uzunlik_m: raqamYokiNull,
          soni: raqamYokiNull,
          miqdor: raqamYokiNull,
          birlik: { type: ['string', 'null'] },
          birlik_massa_kg: raqamYokiNull,
          doira: { type: 'string', enum: [...DOIRALAR] },
          tayanchga_tegishli: { type: 'boolean' },
          ota_marka: matnYokiNull,
          varaq: matnYokiNull,
          pozitsiya: matnYokiNull,
          jadvaldan: { type: 'boolean' },
          ishonch: { type: 'number' },
          izoh: matnYokiNull,
        },
      },
    },
    ogohlantirishlar: { type: 'array', items: { type: 'string' } },
  },
};
