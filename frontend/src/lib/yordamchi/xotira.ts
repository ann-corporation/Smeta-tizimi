/**
 * Jarvis xotirasi (mavjud t2_agent_xotira, 3 daraja: foydalanuvchi / kompaniya / tizim — yangi parallel xotira yo'q).
 * Kalit nomi maydoni `smeta.jarvis.<xesh>` (RPC regulyar ifodasiga mos: ^smeta\.[a-z0-9_.-]{1,74}$), shu sabab migratsiya kerak emas.
 * Xotiraga PUL summalari, parol/kalit, karta/hujjat raqamlari, e-pochta/telefon YOZILMAYDI; xotira hech qachon ruxsatni kengaytirmaydi.
 * Sof funksiyalar (server va klient bir xil qoida).
 */
export type XotiraDaraja = 'foydalanuvchi' | 'kompaniya';
export type XotiraTekshiruv = { ok: true; mazmun: string } | { ok: false; sabab: string };

const MAX = 400;
const MAXFY: Array<[RegExp, string]> = [
  [/\d[\d\s.,]{4,}\d|\d{5,}/, 'katta son (summa/raqam)'],
  [/(\d\s*(mlrd|mln|млн|млрд|ming|минг|тыс|so['‘’ʻ`]?m|сум|uzs|usd|\$))|(\b(summa|narx|цена|сумма)\b.*\d)/i, 'pul summasi'],
  [/(parol|пароль|password|token|api[\s_-]?key|kalit(i)?\s*[:=]|secret|bearer|sk-[a-z0-9])/i, 'parol/kalit'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'e-pochta'],
  [/(\+?998[\s-]?\d{2}|\b\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b)/, 'telefon raqami'],
  [/\b(inn|stir|пинфл|pinfl|passport|паспорт)\b/i, 'shaxsiy/yuridik raqam'],
];

/** Xotiraga yozish mumkinmi: pul, parol, shaxsiy raqamlar rad etiladi. */
export function xotiraTekshir(xom: string): XotiraTekshiruv {
  const mazmun = xom.replace(/\s+/g, ' ').trim();
  if (mazmun.length < 4) return { ok: false, sabab: 'juda qisqa' };
  if (mazmun.length > MAX) return { ok: false, sabab: `${MAX} belgidan uzun` };
  for (const [re, sabab] of MAXFY) if (re.test(mazmun)) return { ok: false, sabab };
  return { ok: true, mazmun };
}

/** Bir xil mazmun — bir xil kalit (qayta aytilsa takror yozilmaydi, yangilanadi). */
export function xotiraKalit(mazmun: string): string {
  let h = 5381; const s = mazmun.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `smeta.jarvis.${h.toString(36)}`;
}
export const jarvisKalitmi = (kalit: string) => kalit.startsWith('smeta.jarvis.');

const YOZ_RE = /^\s*(?:jarvis[,\s]+)?(?:eslab qol|eslab qoling|esla|yodda tut|yodlab qol|запомни|запомните|remember(?: that)?)\s*[:,-]?\s*(.+)$/isu;
const UNUT_RE = /^\s*(?:jarvis[,\s]+)?(?:unut|unuting|забудь|forget)(?![\p{L}])\s*[:,-]?\s*(.*)$/isu;
const KORSAT_RE = /(haqimda|обо мне|about me|mening xotiram|моя память|my memory).*(bil|знаешь|know|nima|xotira)|(xotira|память|memory).*(ko['‘’ʻ`]?rsat|покажи|show|list|nimalar)|(nima|nimalarni|что).*(eslab qolgan|помнишь|remember)/isu;

/** Xotira buyrug'i: yozish (mazmun + daraja), unutish (raqam/matn), ko'rsatish. */
export type XotiraBuyruq = { tur: 'yoz'; mazmun: string; daraja: XotiraDaraja } | { tur: 'unut'; belgi: string } | { tur: 'korsat' };
export function xotiraBuyrugi(xom: string): XotiraBuyruq | null {
  const y = YOZ_RE.exec(xom);
  if (y) {
    const ichki = y[1].trim();
    const kompaniya = /^(?:kompaniya(?:miz)?(?: uchun)?|bizning kompaniya|компани\p{L}*)\s*[:,-]\s*/iu.exec(ichki);
    return { tur: 'yoz', mazmun: kompaniya ? ichki.slice(kompaniya[0].length).trim() : ichki, daraja: kompaniya ? 'kompaniya' : 'foydalanuvchi' };
  }
  const u = UNUT_RE.exec(xom);
  if (u) return { tur: 'unut', belgi: u[1].trim() };
  if (KORSAT_RE.test(xom)) return { tur: 'korsat' };
  return null;
}
