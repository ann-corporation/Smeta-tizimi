/**
 * Yagona yordamchi (Jarvis) niyat aniqlagichi — BEPUL va bir zumda (model/token kerak emas):
 *   «mindmapni ochib ber» -> navigatsiya; «Yevropa 1 ning F2 sini och» -> obyekt kontekstli navigatsiya;
 *   «narxsiz qatorlar», «qoldiq», «holat» -> o'qish (obyekt ma'lumoti ustida); «+5 beton» -> yozuv (model taklif kartasi);
 *   aniqlanmagan -> HECH QACHON rad etilmaydi: eng yaqin sahifa/amallar taklif qilinadi.
 * Sof funksiya: testlanadi. Pul yoki hujjatni bu qatlam o'zi yozmaydi — yozuv faqat taklif kartasi va tasdiq orqali (UI).
 */
import { OCHISH_FELLARI, sozlar, TOLDIRUVCHI, sozNorm } from './matn';
import { oyAjrat, obyektAjrat, type ObyektQisqa } from './kontekst-ajrat';
import { sahifaTopish, sahifaUrl, yaqinSahifalar, type SahifaHavola, type YordamchiSahifa } from './sahifa-qidiruv';

export type OqishVosita = 'holat' | 'narxsiz' | 'qoldiq' | 'qidir';

export type Niyat =
  | { tur: 'navigatsiya'; sahifa: SahifaHavola; obyekt: ObyektQisqa | null; oy: string | null; qoralama: boolean; aniqOchish: boolean }
  | { tur: 'sahifaTanla'; nomzodlar: SahifaHavola[]; obyekt: ObyektQisqa | null; oy: string | null }
  | { tur: 'ruxsatYoq'; nom: string }
  | { tur: 'oqish'; vosita: OqishVosita; arg: string | null; obyekt: ObyektQisqa; sahifa: SahifaHavola | null }
  | { tur: 'yozuv'; obyekt: ObyektQisqa }
  | { tur: 'obyektTanla'; nomzodlar: ObyektQisqa[]; davom: 'oqish' | 'yozuv' | 'navigatsiya' }
  | { tur: 'yordam' }
  | { tur: 'nomalum'; yaqin: SahifaHavola[] };

export type NiyatKontekst = {
  /** Foydalanuvchiga ochiq sahifalar (AdminShell sidebar filtridan: rol/ruxsat/modul). */
  sahifalar: readonly YordamchiSahifa[];
  obyektlar: readonly ObyektQisqa[];
  /** Hozir tanlangan obyekt (PTO workspace) — nom aytilmasa shu. */
  joriyObyekt?: ObyektQisqa | null;
  bugun?: Date;
};

const stem = (royxat: readonly string[]) => royxat.map(sozNorm);
const O_HOLAT = stem(['holat', 'ahvol', 'status', 'состояни', 'статус']);
const O_NARXSIZ = stem(['narxsiz']);
const O_QOLDIQ = stem(['qoldiq', 'ostatka', 'остаток', 'остатки', 'remainder', 'remaining']);
const O_QIDIR = stem(['qidir', 'izla', 'top', 'topib', 'найди', 'поиск', 'search', 'find']);
const Y_FELLAR = stem(['kirit', 'yoz', 'qosh', 'qoshib', 'oshir', 'add', 'enter', 'внеси', 'запиши', 'добавь', 'ввести', 'tuzat', 'ozgartir', 'almashtir', 'qoy']);
const QORALAMA_FELLARI = stem(['yarat', 'tuz', 'tayyorla', 'tayyorlab', 'qoralama', 'создай', 'подготов', 'черновик', 'draft', 'create', 'prepare', 'make']);
/** Savol so'zlari («F2 nima?», «qayerda?»): sahifa o'zi ochilmaydi — tushuntirish oqimi davom etadi, sahifa tugma bo'lib qo'shiladi. */
const SAVOL_SOZLARI = stem(['qayerda', 'qani', 'nima', 'nega', 'qanday', 'где', 'что', 'почему', 'зачем', 'what', 'where', 'why', 'how']);
const YORDAM_RE = /^(nimalar? qila olasan|nimalar? qila olasiz|nima qila olasan|nima qila olasiz|yordam|help|imkoniyatlaring|imkoniyatlar|what can you do|что ты умеешь|что ты можешь|помощь)\s*[?!.]*$/;
const QORALAMA_SAHIFALARI = new Set(['/admin/f2-tayyorlash', '/admin/aosr', '/admin/nakopitelniy', '/admin/fakt', '/admin/zayavka', '/admin/m29']);

const bor = (tokenlar: readonly string[], royxat: readonly string[]) => tokenlar.some((t) => royxat.some((r) => t === r || (r.length >= 5 && t.startsWith(r))));
const bosh = (royxat: readonly string[]) => (t: string) => royxat.some((r) => t === r || (r.length >= 5 && t.startsWith(r)));

const havola = (s: YordamchiSahifa, o: ObyektQisqa | null, oy: string | null): SahifaHavola => ({ yol: s.yol, nom: s.nom, url: sahifaUrl(s.yol, { obyektId: o?.id, oy }) });

export function niyatAniqla(matn: string, ctx: NiyatKontekst): Niyat {
  const xom = matn.trim();
  if (YORDAM_RE.test(xom.toLowerCase().replace(/[ʻʼ‘’`´']/g, ''))) return { tur: 'yordam' };
  const barchasi = sozlar(xom);
  const ob = obyektAjrat(barchasi, ctx.obyektlar);
  const oy = oyAjrat(xom, barchasi, ctx.bugun);
  const ishl = new Set<number>([...(ob?.tur === 'aniq' ? ob.ishlatilgan : []), ...(oy?.ishlatilgan ?? [])]);
  const qolgan = barchasi.filter((_, i) => !ishl.has(i));
  const kontent = qolgan.filter((t) => !TOLDIRUVCHI.has(t));
  const obyekt: ObyektQisqa | null = ob?.tur === 'aniq' ? ob.obyekt : null;
  const amaldagi = obyekt ?? ctx.joriyObyekt ?? null;
  const oyKalit = oy?.oy ?? null;
  const ochish = qolgan.some((t) => OCHISH_FELLARI.has(t));

  /* 1) Yozuv: «+5», «=40», «kirit/yoz/qo'sh» + son — model taklif kartasi tuzadi, foydalanuvchi tasdiqlaydi. */
  const sonBor = qolgan.some((t) => /^\d+$/.test(t)) || /[+=]\s*\d/.test(xom);
  const yozuvMi = /(^|\s)[+=]\s*\d/.test(xom) || (sonBor && bor(kontent, Y_FELLAR));
  /* 2) O'qish so'zlari. Narxsiz/qoldiq/qidir — ma'lumot savoli; «holat» esa aniq sahifa nomi bo'lsa sahifa ustun. */
  const oNarxsiz = bor(kontent, O_NARXSIZ); const oQoldiq = bor(kontent, O_QOLDIQ);
  const qidirIdx = kontent.findIndex(bosh(O_QIDIR));
  const oHolat = bor(kontent, O_HOLAT);
  const oqishSozlari = new Set([...O_HOLAT, ...O_NARXSIZ, ...O_QOLDIQ, ...O_QIDIR]);
  const sahifaTokenlari = kontent.filter((t) => !bor([t], [...oqishSozlari]));

  if (yozuvMi) {
    if (!amaldagi) return { tur: 'obyektTanla', nomzodlar: ctx.obyektlar.slice(0, 6), davom: 'yozuv' };
    return { tur: 'yozuv', obyekt: amaldagi };
  }

  const sahifaNatija = sahifaTopish(kontent, ctx.sahifalar);
  const oqishVosita: OqishVosita | null = oNarxsiz ? 'narxsiz' : oQoldiq ? 'qoldiq' : qidirIdx >= 0 && kontent.length > 1 ? 'qidir' : null;

  if (oqishVosita) {
    if (!amaldagi) return { tur: 'obyektTanla', nomzodlar: ctx.obyektlar.slice(0, 6), davom: 'oqish' };
    const arg = oqishVosita === 'qidir' ? qidirArg(xom) : filtrArg(sahifaTokenlari);
    return { tur: 'oqish', vosita: oqishVosita, arg, obyekt: amaldagi, sahifa: null };
  }
  if (oHolat && (!sahifaNatija || sahifaNatija.tur !== 'aniq' || sahifaTokenlari.length === 0)) {
    if (amaldagi) { const hs = ctx.sahifalar.find((s) => s.yol === '/admin/holat'); return { tur: 'oqish', vosita: 'holat', arg: null, obyekt: amaldagi, sahifa: hs ? havola(hs, amaldagi, oyKalit) : null }; }
    if (ctx.obyektlar.length) return { tur: 'obyektTanla', nomzodlar: ctx.obyektlar.slice(0, 6), davom: 'oqish' };
  }

  /* 3) Navigatsiya (sahifa nomi + ixtiyoriy obyekt/oy). */
  if (sahifaNatija?.tur === 'ruxsatYoq') return { tur: 'ruxsatYoq', nom: sahifaNatija.nom };
  if (ob?.tur === 'noaniq' && sahifaNatija?.tur === 'aniq') return { tur: 'obyektTanla', nomzodlar: ob.nomzodlar, davom: 'navigatsiya' };
  if (sahifaNatija?.tur === 'noaniq') return { tur: 'sahifaTanla', nomzodlar: sahifaNatija.nomzodlar.map((s) => havola(s, amaldagi, oyKalit)), obyekt: amaldagi, oy: oyKalit };
  if (sahifaNatija?.tur === 'aniq' && (sahifaNatija.qoplanish >= 0.5 || ochish)) {
    const s = sahifaNatija.sahifa;
    const qoralama = QORALAMA_SAHIFALARI.has(s.yol) && bor(kontent, QORALAMA_FELLARI);
    return { tur: 'navigatsiya', sahifa: havola(s, amaldagi, oyKalit), obyekt: amaldagi, oy: oyKalit, qoralama, aniqOchish: ochish || !bor(qolgan, SAVOL_SOZLARI) };
  }
  /* Faqat obyekt nomi aytilgan («Yevropa 1») — uning holat sahifasi. */
  if (obyekt && kontent.length === 0) {
    const holat = ctx.sahifalar.find((s) => s.yol === '/admin/holat');
    if (holat) return { tur: 'navigatsiya', sahifa: havola(holat, obyekt, oyKalit), obyekt, oy: oyKalit, qoralama: false, aniqOchish: true };
  }

  /* 4) Hech narsa mos kelmadi — rad etmaymiz: eng yaqin sahifalar. */
  return { tur: 'nomalum', yaqin: yaqinSahifalar(kontent, ctx.sahifalar).map((s) => havola(s, amaldagi, oyKalit)) };
}

/** «qidir» argumenti: aslida aytilgan so'zlar (normallashmagan), qidiruv so'zidan keyingilar. */
function qidirArg(xom: string): string | null {
  const m = /(?:qidir\w*|izla\w*|top\w*|найди\w*|поиск\w*|search|find)\s+(.+)$/iu.exec(xom.replace(/[ʻʼ‘’`´]/g, "'"));
  const a = (m?.[1] ?? '').replace(/\b(ni|ga|ber|bering|iltimos)\b/giu, '').replace(/\s+/g, ' ').trim();
  return a.length >= 2 ? a.slice(0, 120) : null;
}

/** «Narxsiz/qoldiq» filtri: umumiy so'zlar (qator, ish, ro'yxat…) tashlanadi; qolsa — shu so'z bo'yicha filtr. */
const UMUMIY_SOZLAR = new Set(['qator', 'qatorlar', 'qatorlarni', 'ish', 'ishlar', 'ishlarni', 'royxat', 'royxati', 'hammasi', 'barchasi', 'list', 'rows', 'строки', 'строк', 'список', 'все', 'eng', 'katta', 'qaysi', 'qancha', 'bor', 'material', 'materiallar'].map(sozNorm));
function filtrArg(tokenlar: readonly string[]): string | null {
  const q = tokenlar.filter((t) => !UMUMIY_SOZLAR.has(t) && ![...UMUMIY_SOZLAR].some((u) => u.length >= 5 && t.startsWith(u)));
  return q.length ? q.join(' ').slice(0, 120) : null;
}
