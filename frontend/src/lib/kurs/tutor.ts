/**
 * JARVIS = REPETITOR: «F-2 ni qanday tayyorlayman?», «buni qanday qilaman?» -> dars qadamlari + «Ko‘rsat» (yo‘l-yo‘riq) havolasi.
 * Bepul, bir zumda: kalit so‘zlar (dars.sozlar + dars nomi + sahifa nomlari) bo‘yicha moslik; model kerak emas.
 * Faqat foydalanuvchi YO‘LIDAGI darslar javob bo‘ladi (PTO ga buxgalter darsi aytilmaydi).
 */
import { DARSLAR } from './darslar';
import type { Dars } from './model';
import { kursYoli, sahifaYoli } from './yol';
import { joriyKursKontekst } from './kontekst-store';

export type DarsJavobi = {
  tur: 'dars';
  /** Topilgan dars (null — faqat «kurs/darslar» so‘ralgan: bo‘lim ro‘yxati). */
  dars: { id: string; nom: string; maqsad: string; nega: string; daqiqa: number; qadamlar: string[]; xatolar: string[] } | null;
  boshqa: { id: string; nom: string }[];
};

const apostrof = /[ʻʼ‘’`´']/g;
export const norm = (s: string): string =>
  s.toLowerCase().replace(apostrof, '').replace(/ё/g, 'е').replace(/([a-zа-я])[\s-]+(\d)/g, '$1$2');
const tokenlar = (s: string): string[] => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** «Qanday/как/how/o‘rgat/dars/kurs» — o‘rganish savoli belgisi. */
/* «qanaqa» ATAYLAB yo‘q: «ahvol qanaqa?» — holat savoli, o‘rganish emas (egasi 2026-11-13: Jarvis har savolga dars qaytarardi). */
const SAVOL = ['qanday', 'orgat', 'dars', 'kurs', 'qollanma', 'yolyoriq', 'yoriqnoma', 'kak', 'как', 'научи', 'обуч', 'урок', 'инструкц', 'how', 'learn', 'teach', 'tutorial', 'lesson'];
const BO_SH = new Set(['qanday', 'qanaqa', 'qilaman', 'qilamiz', 'men', 'ni', 'ga', 'da', 'bu', 'buni', 'bilan', 'uchun', 'kerak', 'korsat', 'orgat', 'dars', 'darslar', 'kurs', 'how', 'to', 'do', 'i', 'the', 'a', 'как', 'мне', 'сделать', 'qollanma']);

const MAX_SOZ = 8;
const MIN_QOPLANISH = 0.5;

const mos = (t: string, kw: string) => t === kw || (kw.length >= 5 && t.startsWith(kw)) || (t.length >= 5 && kw.startsWith(t));

const darsKalitlari = (d: Dars): Set<string> => {
  const m = new Set<string>();
  const qosh = (s: string) => tokenlar(s).forEach((x) => { if (x.length >= 2 && !BO_SH.has(x)) m.add(x); });
  d.sozlar?.forEach(qosh);
  qosh(d.nom);
  return m;
};

export function savolMi(matn: string): boolean {
  const t = tokenlar(matn);
  return t.some((x) => SAVOL.some((s) => x === s || (s.length >= 4 && x.startsWith(s))));
}

/** @param yol foydalanuvchi yo‘lidagi darslar; berilmasa joriy kontekstdan (AdminShell o‘rnatadi), u ham yo‘q bo‘lsa — `ochiqYollar` bo‘yicha. */
export function darsSavoli(matn: string, opt: { yol?: readonly Dars[]; ochiqYollar?: ReadonlySet<string> } = {}): DarsJavobi | null {
  if (!savolMi(matn)) return null;
  let nomzod: readonly Dars[] = opt.yol ?? [];
  if (!opt.yol) {
    const k = joriyKursKontekst();
    if (k) nomzod = kursYoli(k).darslar;
    else if (opt.ochiqYollar) nomzod = DARSLAR.filter((d) => d.qadamlar.every((s) => { const y = sahifaYoli(s.sahifa); return !!y && opt.ochiqYollar!.has(y); }));
    else nomzod = DARSLAR;
  }
  const t = tokenlar(matn).filter((x) => !BO_SH.has(x));
  /* Uzun gap — maslahat/tahlil savoli («faktlar kiritilmagan, qanday yo‘lga qo‘yamiz?»): dars emas, AI javobiga ketadi. */
  if (t.length > MAX_SOZ) return null;
  const ball = nomzod.map((d) => { const kw = darsKalitlari(d); return { d, b: t.filter((x) => [...kw].some((k) => mos(x, k))).length }; }).filter((x) => x.b > 0);
  if (!ball.length) return null; // faqat «kurs» desa — navigatsiya (kurs sahifasi sinonimi) hal qiladi
  ball.sort((a, b) => b.b - a.b);
  const eng = ball[0];
  /* Bitta tasodifiy so‘z («obyekt», «smeta») dars emas: savol so‘zlarining kamida yarmi shu darsga tegishli bo‘lishi shart. */
  if (eng.b / t.length < MIN_QOPLANISH) return null;
  const d = eng.d;
  return {
    tur: 'dars',
    dars: { id: d.id, nom: d.nom, maqsad: d.maqsad, nega: d.nega, daqiqa: d.daqiqa, qadamlar: d.qadamlar.map((s) => s.matn), xatolar: [...d.xatolar] },
    boshqa: ball.slice(1, 3).filter((x) => x.b >= eng.b - 0 && x.d.id !== d.id).map((x) => ({ id: x.d.id, nom: x.d.nom })),
  };
}

/** «Ko‘rsat» havolasi: kurs sahifasi yo‘l-yo‘riqni o‘zi boshlaydi. */
export const koRsatHavolasi = (darsId: string): string => `/admin/kurs?boshla=${encodeURIComponent(darsId)}`;
