/**
 * Kasb agentlari mantig'i (sof funksiyalar): mavzu qo'riqchisi, ma'lumot toifasini tanlash, sahifaga moslashuv, prompt.
 * Chegara MODELGA ishonmaydi: ruxsatsiz mavzu modelga umuman yuborilmaydi (token ham sarflanmaydi), ruxsatsiz ma'lumot bazadan chiqmaydi.
 */

export type Toifa = 'obyektlar' | 'smeta_pul' | 'f2_fakt_pul' | 'hajm' | 'grafik' | 'moliya' | 'ombor' | 'sifat' | 'kadr' | 'texnika';
export const PUL_TOIFALARI: Toifa[] = ['smeta_pul', 'f2_fakt_pul', 'moliya'];

export type KasbMalumoti = {
  harakatlar?: string[];
  rol: string; profil: string; nom: string; vazifa: string; kategoriyalar: Toifa[]; namuna_savollar: string[]; taqiq_izoh: string | null;
  boshqalar: Array<{ rol: string; nom: string; vazifa: string }>;
};

const TOIFA_NOMI: Record<Toifa, string> = {
  obyektlar: 'obyektlar ro‘yxati', smeta_pul: 'smeta summalari va narxlar', f2_fakt_pul: 'F2 va fakt summalari', hajm: 'bajarilish foizi', grafik: 'ish grafigi',
  moliya: 'to‘lov, xarajat, faktura, shartnoma', ombor: 'ombor', sifat: 'AOSR va laboratoriya', kadr: 'xodimlar va oylik', texnika: 'texnika',
};

/** Apostrof/tutuq belgilarining hamma ko'rinishi olib tashlanadi (to'lov, to‘lov, toʻlov, to`lov → tolov), kichik harf, ortiqcha bo'shliq yo'q. */
export const normMatn = (s: string): string => s.toLowerCase().replace(/['‘’ʻʼ`´′]/g, '').replace(/\s+/g, ' ').trim();

/** Savol qaysi toifalarga tegishli (kalit so'zlar: lotin, kirill, rus). */
const MAVZULAR: Array<[Toifa, RegExp]> = [
  ['kadr', /(oylik|maosh|ish haqi|xodim|kadr|ishchi(lar)? soni|зарплат|оклад|сотрудник|штат|salary)/i],
  ['moliya', /(tolov|xarajat|faktura|shartnoma|qarz|debitor|kreditor|оплат|платеж|платёж|расход|счет|счёт|договор|долг)/i],
  ['smeta_pul', /(smeta|narxsiz|narx\b|narxi|смет|расценк|стоимост)/i],
  ['f2_fakt_pul', /(\bf2\b|\bф2\b|fakt|akt\b|aktlar|факт|\bакт)/i],
  ['hajm', /(foiz|bajarilish|progress|ish borishi|qancha(si)? bajarildi|выполнен|процент|%)/i],
  ['grafik', /(grafik|muddat|kechik|kechiktir|график|срок|просроч|опозд)/i],
  ['ombor', /(ombor|sklad|material|qoldiq|kirim|chiqim|prixod|rasxod|склад|остаток|материал)/i],
  ['sifat', /(aosr|laborator|sinov|sifat|protokol|акт скрыт|лаборатор|протокол|качеств)/i],
  ['texnika', /(texnika|mashina|avtomobil|yoqilg|техника|машин|автомоб)/i],
];
/** Pul haqida umumiy so'rov (aniq toifa aytilmagan bo'lsa ham). */
const PUL_SOROVI = /(summa|narx|pul\b|som\b|qiymat|qancha turadi|сумм|цен[аы]|стоимост|деньг|\bсум\b|\$|usd)/i;

export const MAVZU_NOMI = TOIFA_NOMI;

/** Savoldan mavzu toifalarini ajratadi. */
export function mavzular(savol: string): Toifa[] {
  const q = new Set<Toifa>();
  const n = normMatn(savol);
  for (const [t, re] of MAVZULAR) if (re.test(n)) q.add(t);
  return [...q];
}

export type Taqiq = { sabab: 'toifa' | 'pul'; toifalar: Toifa[] };

/**
 * Ruxsatsiz mavzuni aniqlaydi. Rolga hech bir pul toifasi ruxsat etilmagan bo'lsa, pul haqidagi HAR QANDAY savol rad etiladi.
 * Aks holda savol tegishli toifalarning HAMMASI ruxsatsiz bo'lgandagina rad etiladi (aralash savol — ruxsatli qismi bilan javob olinadi).
 */
export function mavzuTaqiqi(savol: string, ruxsat: readonly string[]): Taqiq | null {
  const t = mavzular(savol);
  const ruxsatsiz = t.filter((x) => !ruxsat.includes(x));
  if (t.length > 0 && ruxsatsiz.length === t.length) return { sabab: 'toifa', toifalar: ruxsatsiz };
  const pulBor = PUL_TOIFALARI.some((p) => ruxsat.includes(p));
  if (!pulBor && PUL_SOROVI.test(normMatn(savol))) return { sabab: 'pul', toifalar: PUL_TOIFALARI };
  return null;
}

/** Sahifa → qo'shimcha toifa ishorasi (sahifaga mos javob uchun). */
const SAHIFA_ISHORASI: Array<[RegExp, Toifa[]]> = [
  [/\/(moliya|tolov|xarajat|faktura|shartnoma|crm)/, ['moliya']],
  [/\/(f2|forma|nakopitelniy|akt)/, ['f2_fakt_pul', 'hajm']],
  [/\/(smeta|narx|katalog|res|lrv)/, ['smeta_pul']],
  [/\/(sklad|ombor|logistika|zayavka|taminot)/, ['ombor']],
  [/\/(aosr|laborator|sifat|hujjat)/, ['sifat']],
  [/\/(grafik|jadval|fakt)/, ['grafik', 'hajm']],
  [/\/(kadr|xodim|ishchi)/, ['kadr']],
  [/\/(texnika|mashina)/, ['texnika']],
];
export function sahifaIshorasi(sahifa: string | null | undefined): Toifa[] {
  if (!sahifa) return [];
  for (const [re, t] of SAHIFA_ISHORASI) if (re.test(sahifa.toLowerCase())) return t;
  return [];
}

/** Bazadan so'raladigan toifalar: savol mavzulari + sahifa ishorasi ∩ ruxsat; hech narsa aniqlanmasa — arzon umumiy to'plam. */
export function toifalarniTanla(savol: string, ruxsat: readonly string[], sahifa?: string | null): Toifa[] {
  const istak = new Set<Toifa>(['obyektlar', ...mavzular(savol), ...sahifaIshorasi(sahifa)]);
  if (mavzular(savol).length === 0) { istak.add('hajm'); istak.add('grafik'); }
  return [...istak].filter((t) => ruxsat.includes(t));
}

/** Aniq rad matni (model chaqirilmaydi). */
export function radMatni(kasb: Pick<KasbMalumoti, 'nom' | 'boshqalar' | 'taqiq_izoh'>, t: Taqiq): string {
  const nima = t.sabab === 'pul' ? 'pul va narx ma’lumoti' : t.toifalar.map((x) => TOIFA_NOMI[x]).join(', ');
  const kim = kasb.boshqalar
    .filter((b) => /direktor|bugalter|PTO/i.test(b.nom))
    .slice(0, 3).map((b) => b.nom.replace(/ yordamchisi$/i, '')).join(' yoki ');
  return `Bu savol (${nima}) sizning lavozimingiz — «${kasb.nom.replace(/ yordamchisi$/i, '')}» — doirasida emas, shuning uchun men bu ma’lumotni ko‘rsata olmayman.` +
    (kim ? ` Buni ${kim} ko‘ra oladi.` : '') + (kasb.taqiq_izoh ? `\n\n_${kasb.taqiq_izoh}_` : '');
}

/** Kasb ishchisining system prompti (yadro qoidalar `tizimPrompti` da; bu — kasbga xos qism). */
export function kasbPrompti(k: Pick<KasbMalumoti, 'nom' | 'vazifa' | 'boshqalar' | 'taqiq_izoh'>, ishlatilgan: readonly string[], taqiqlangan: readonly string[]): string {
  const boshqalar = k.boshqalar.map((b) => `- ${b.nom}: ${b.vazifa}`).join('\n');
  return [
    `SEN: «${k.nom}» — ushbu foydalanuvchining shaxsiy AI ishchisi. Vazifang: ${k.vazifa}`,
    `Sen faqat quyidagi FAKTLAR bo‘limidagi ma’lumot asosida javob berasan. Berilgan toifalar: ${ishlatilgan.map((x) => TOIFA_NOMI[x as Toifa] ?? x).join(', ') || '—'}.`,
    taqiqlangan.length ? `Foydalanuvchining lavozimi uchun YOPIQ toifalar (ma’lumoti senga berilmagan): ${taqiqlangan.map((x) => TOIFA_NOMI[x as Toifa] ?? x).join(', ')}.` : '',
    'QOIDALAR:',
    '1. Javobdagi har bir raqam, nom va sana FAKTLARDAN olinsin. O‘ylab topma, taxmin qilma; ma’lumot yo‘q bo‘lsa «bu ma’lumot topilmadi» de.',
    '2. Raqamlarni o‘zgartirma va yaxlitlama: summa so‘mda, minglik bo‘sh joy bilan (masalan 7 417 409 951 so‘m); foiz — 1 xonagacha.',
    '3. Savol sening doirangdan tashqarida bo‘lsa yoki ma’lumoti senga berilmagan bo‘lsa — aytganingdek ko‘rsatma: «Bu ma’lumot sizning doirangizda emas» va qaysi ishchi javob bera olishini ayt (quyidagi ro‘yxatdan). Boshqa kasbning ma’lumotini aytib bermaysan, hatto bilsang ham.',
    '4. Qisqa va aniq yoz: avval 1–2 gapli xulosa, so‘ng zarur bo‘lsa ro‘yxat/jadval. Muhim xavf yoki kechikish bo‘lsa uni oldin ayt. Oxirida ixtiyoriy «Keyingi qadam» (1 ta) berishing mumkin.',
    '5. Javob tili — savol tilida (o‘zbekcha lotin yoki ruscha). Hujjat/akt matni so‘ralsa — ruscha.',
    '6. Sen hech narsani bajarmaysan, yozmaysan, o‘zgartirmaysan — faqat ko‘rsatasan va tushuntirasan. «Qildim/yubordim» dema.',
    '',
    'BOSHQA ISHCHILAR (faqat kimga murojaat qilishni bilish uchun; ularning ma’lumoti senda YO‘Q):',
    boshqalar || '- (yo‘q)',
  ].filter(Boolean).join('\n');
}

/** Faktlarni modelga beriladigan ixcham JSON matniga aylantiradi (uzunlik chegarasi bilan). */
export function faktMatni(fakt: unknown, chegara = 24_000): string {
  const s = JSON.stringify(fakt);
  return s.length <= chegara ? s : s.slice(0, chegara) + '…[qisqartirildi]';
}

const HARAKAT_TAVSIFI: Record<string, string> = {
  ombor_kirim: '- ombor_kirim: omborga KIRIM yozish. parametrlar: {"obyekt_id": <FAKTLARdagi obyekt id>, "nomi": "Sement M400", "birligi": "tonna", "obyomi": 5, "sana": "YYYY-MM-DD (ixtiyoriy)", "izoh": "ixtiyoriy"}',
  ombor_chiqim: '- ombor_chiqim: ombordan CHIQIM yozish. parametrlar: ombor_kirim bilan bir xil.',
  grafik_foiz: '- grafik_foiz: grafikdagi ish bajarilish foizini yangilash. parametrlar: {"grafik_id": <FAKTLARdagi grafik "id">, "foiz": 0-100}',
  eslatma: '- eslatma: foydalanuvchi uchun eslatma saqlash. parametrlar: {"kalit": "qisqa.kalit", "mazmun": "matn"}',
};
/** Rolga ruxsat etilgan harakatlar ro'yxati va qoidalari (prompt qismi). */
export function harakatMatni(harakatlar: readonly string[]): string {
  const royxat = harakatlar.map((h) => HARAKAT_TAVSIFI[h]).filter(Boolean).join('\n');
  return [
    'HARAKATLAR (sen hech narsa bajarmaysan — faqat TAKLIF qilasan, foydalanuvchi tasdiqlaydi):',
    royxat || '- (bu lavozim uchun harakat yo‘q)',
    'Faqat foydalanuvchi AYNAN so‘ragandagina harakat taklif qil (masalan «omborga 5 tonna sement kirim qil»). Oddiy savolga harakat taklif qilma.',
    '"aniq": true — faqat foydalanuvchi BARCHA qiymatlarni (nima, qancha, qayerga) o‘zi aytgan bo‘lsa. Biror qiymat yetishmasa yoki taxmin qilsang — harakat taklif QILMA, javobda yetishmayotganini so‘ra.',
    'obyekt_id va grafik_id ni FAQAT FAKTLARdan ol; o‘ylab topma.',
  ].join('\n');
}

export type TaklifHarakat = { amal: string; parametrlar: Record<string, unknown>; tushuntirish: string; aniq: boolean };
/** Model javobini ajratadi: JSON bo'lsa {javob, harakatlar}, aks holda butun matn — oddiy javob (hech qachon yo'qolmaydi). */
export function javobniAjrat(xom: string): { javob: string; harakatlar: TaklifHarakat[] } {
  const s = String(xom ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const j = JSON.parse(s) as { javob?: unknown; harakatlar?: unknown };
    if (j && typeof j === 'object' && typeof j.javob === 'string') {
      const h = (Array.isArray(j.harakatlar) ? j.harakatlar : []).flatMap((x): TaklifHarakat[] => {
        const o = (x ?? {}) as Record<string, unknown>;
        const amal = typeof o.amal === 'string' ? o.amal : '';
        const p = o.parametrlar && typeof o.parametrlar === 'object' && !Array.isArray(o.parametrlar) ? o.parametrlar as Record<string, unknown> : null;
        return amal && p ? [{ amal, parametrlar: p, tushuntirish: String(o.tushuntirish ?? '').slice(0, 400), aniq: o.aniq === true }] : [];
      });
      return { javob: j.javob.trim() || 'Javob bo‘sh qaytdi', harakatlar: h };
    }
  } catch { /* JSON emas */ }
  return { javob: s || 'Javob bo‘sh qaytdi', harakatlar: [] };
}
