/**
 * Yagona yordamchi (Jarvis) niyat aniqlagichi — BEPUL va bir zumda (model/token kerak emas):
 *   «mindmapni ochib ber» -> navigatsiya; «Yevropa 1 ning F2 sini och» -> obyekt kontekstli navigatsiya;
 *   «narxsiz qatorlar», «qoldiq», «holat» -> o'qish (obyekt ma'lumoti ustida); «+5 beton» -> yozuv (model taklif kartasi);
 *   aniqlanmagan -> HECH QACHON rad etilmaydi: eng yaqin sahifa/amallar taklif qilinadi.
 * Sof funksiya: testlanadi. Pul yoki hujjatni bu qatlam o'zi yozmaydi — yozuv faqat taklif kartasi va tasdiq orqali (UI).
 */
import { yukSlotAjrat, yukSlotUrl } from './yuk-slot';
import { OCHISH_FELLARI, sozlar, sozMosligi, TOLDIRUVCHI, sozNorm } from './matn';
import { oyAjrat, obyektAjrat, type ObyektQisqa } from './kontekst-ajrat';
import { kimSavoli, type KimQism } from './kim';
import { vositaTop } from './vosita/reestr';
import type { Davom } from './vosita/tur';
import { darsSavoli, type DarsJavobi } from '../kurs/tutor';
import { sahifaTopish, sahifaUrl, yaqinSahifalar, type SahifaHavola, type YordamchiSahifa } from './sahifa-qidiruv';

export type OqishVosita = 'holat' | 'narxsiz' | 'qoldiq' | 'qidir';

export type Niyat =
  | { tur: 'navigatsiya'; sahifa: SahifaHavola; obyekt: ObyektQisqa | null; oy: string | null; qoralama: boolean; aniqOchish: boolean }
  | { tur: 'sahifaTanla'; nomzodlar: SahifaHavola[]; obyekt: ObyektQisqa | null; oy: string | null }
  | { tur: 'ruxsatYoq'; nom: string }
  | { tur: 'oqish'; vosita: OqishVosita; arg: string | null; obyekt: ObyektQisqa; sahifa: SahifaHavola | null }
  | { tur: 'yozuv'; obyekt: ObyektQisqa }
  | { tur: 'obyektTanla'; nomzodlar: ObyektQisqa[]; davom: 'oqish' | 'yozuv' | 'navigatsiya' }
  | { tur: 'qarz' }
  /** O'rganish halqasi: «tizim nimani o'rgandi» (oqigan) / «qayerda qiynalishyapti» (qiyin). Faqat o'qish, bepul. */
  | { tur: 'osuvchi'; qism: 'oqigan' | 'qiyin' }
  | { tur: 'f2Royxat'; obyekt: ObyektQisqa; oy: string | null }
  | { tur: 'aosrYetishmaydi'; obyekt: ObyektQisqa }
  | { tur: 'f2Qoralama'; obyekt: ObyektQisqa; oy: string }
  | { tur: 'aosrQoralama'; obyekt: ObyektQisqa; filtr: string | null }
  /** Sahifa o'zi ro'yxatdan o'tkazgan amal (masalan Smeta Studio: «katalogdan ish qo'sh»). */
  | { tur: 'sahifaAmal'; amal: SahifaAmalQisqa }
  | { tur: 'yordam' }
  /** «Men kimman / rolim / bu qaysi obyekt»: sessiya ma'lumotidan bepul mahalliy javob (hech qachon modelga «kim» deb so'ralmaydi). */
  | { tur: 'kim'; qism: KimQism }
  /** Tuzilgan vosita (vosita/reestr.ts): o'qish yoki taklif+tasdiq; davom — aniqlashtiruvchi savolga javob. */
  | { tur: 'vosita'; id: string; davom?: Davom }
  /** Kurs repetitori: «F2 ni qanday tayyorlayman?» -> dars qadamlari + «Ko‘rsat». */
  | DarsJavobi
  | { tur: 'nomalum'; yaqin: SahifaHavola[] };

/** izoh — taklif kartasida ko'rsatiladi (masalan token narxi); pul — ikkinchi «Tasdiqlayman» talab qiladi (token/pul/hujjat). */
export type SahifaAmalQisqa = { id: string; nom: string; kalitlar?: readonly string[]; tasdiq?: boolean; izoh?: string; pul?: boolean };

export type NiyatKontekst = {
  /** Hozirgi sahifa ro'yxatdan o'tkazgan amallar (registry hook). */
  sahifaAmallar?: readonly SahifaAmalQisqa[];
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
const QARZ = stem(['qarz', 'qarzi', 'qarzlar', 'qarzdorlik', 'долг', 'долги', 'долгов', 'долгам', 'задолженность', 'debt', 'debts']);
/* O'rganish halqasi (ru/en sinonimlar): «tizim nimani o'rgandi», «qayerda qiynalishyapti». */
const OSUV_OGRAN = stem(['organdi', 'organgan', 'organyap', 'tajriba', 'научил', 'обучил', 'learn']);
const OSUV_TIZIM = stem(['tizim', 'tizimi', 'система', 'системе', 'system']);
const OSUV_QIYIN = stem(['qiynal', 'adashad', 'adashis', 'затруд', 'struggl', 'friction']);
const MIQDOR_SAVOL = stem(['qancha', 'necha', 'nechta', 'jami', 'сколько', 'how', 'much', 'many', 'holat', 'holati', 'bor', 'status']);
const F2_SOZ = stem(['f2', 'ф2']);
const AOSR_SOZ = stem(['aosr', 'аоср']);
const YETISHMAYDI = stem(['yetishmayapti', 'yetishmaydi', 'yetishmayotgan', 'qamrov', 'coverage', 'недостает', 'нехватает', 'не хватает', 'нет', 'yoq', 'qaysi', 'missing']);
const QORALAMA_ANIQ = new Set(stem(['yarat', 'yaratib', 'tuz', 'tuzib', 'tayyorla', 'tayyorlab', 'tayyorlang', 'yaratib', 'создай', 'создать', 'подготовь', 'подготовить', 'draft', 'create', 'prepare', 'make']));
const SAVOL_SOZLARI = stem(['qayerda', 'qani', 'nima', 'nega', 'qanday', 'где', 'что', 'почему', 'зачем', 'what', 'where', 'why', 'how']);
const YORDAM_RE = /^(nimalar? qila olasan|nimalar? qila olasiz|nima qila olasan|nima qila olasiz|yordam|help|imkoniyatlaring|imkoniyatlar|what can you do|что ты умеешь|что ты можешь|помощь)\s*[?!.]*$/;
const QORALAMA_SAHIFALARI = new Set(['/admin/f2-tayyorlash', '/admin/aosr', '/admin/nakopitelniy', '/admin/fakt', '/admin/zayavka', '/admin/m29']);

/** Imlo xatosiga bardoshlilik: uzun (≥7) so'zlarda bitta harf farqi (almashtirish/tushib qolish/ortiqcha/o'rin almashishi) yetarli. */
function yaqinSoz(a: string, b: string): boolean {
  if (a.length < 7 || b.length < 7 || Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const x = a.slice(i + 1); const y = b.slice(i + 1);
  return x === y || a.slice(i) === y || x === b.slice(i) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
}
const bor = (tokenlar: readonly string[], royxat: readonly string[]) => tokenlar.some((t) => royxat.some((r) => t === r || (r.length >= 5 && t.startsWith(r)) || yaqinSoz(t, r)));
const bosh = (royxat: readonly string[]) => (t: string) => royxat.some((r) => t === r || (r.length >= 5 && t.startsWith(r)));

const havola = (s: YordamchiSahifa, o: ObyektQisqa | null, oy: string | null): SahifaHavola => ({ yol: s.yol, nom: s.nom, url: sahifaUrl(s.yol, { obyektId: o?.id, oy }) });

export function niyatAniqla(matn: string, ctx: NiyatKontekst): Niyat {
  const xom = matn.trim();
  if (YORDAM_RE.test(xom.toLowerCase().replace(/[ʻʼ‘’`´']/g, ''))) return { tur: 'yordam' };
  { const kq = kimSavoli(xom); if (kq) return { tur: 'kim', qism: kq }; }
  /* Sahifa o'z amalini (masalan «F2 ni Excel ga yuklash») e'lon qilgan bo'lsa — «vositasi yo'q» javobi uni bosib ketmaydi. */
  { const v = vositaTop(xom); if (v && !(v.id === 'yoq' && sahifaAmalTop(sozlar(xom).filter((x) => !TOLDIRUVCHI.has(x)), ctx.sahifaAmallar))) return { tur: 'vosita', id: v.id }; }
  const yukSlot = yukSlotAjrat(xom);
  if (yukSlot) return { tur: 'navigatsiya', sahifa: { yol: '/admin/yuk-chaqirish', nom: 'Yuk chaqirish', url: yukSlotUrl(yukSlot) }, obyekt: null, oy: null, qoralama: true, aniqOchish: true };
  { const dars = darsSavoli(xom, { ochiqYollar: new Set(ctx.sahifalar.map((s) => s.yol)) }); if (dars) return dars; }
  const barchasi = sozlar(xom);
  const ob = obyektAjrat(barchasi, ctx.obyektlar);
  const oy = oyAjrat(xom, barchasi, ctx.bugun);
  const ishl = new Set<number>([...(ob?.tur === 'aniq' ? ob.ishlatilgan : []), ...(oy?.ishlatilgan ?? [])]);
  const qolgan = barchasi.filter((_, i) => !ishl.has(i));
  const kontent = qolgan.filter((t) => !TOLDIRUVCHI.has(t));
  const obyekt: ObyektQisqa | null = ob?.tur === 'aniq' ? ob.obyekt : null;
  const amaldagi = obyekt ?? ctx.joriyObyekt ?? null;
  const oyKalit = oy?.oy ?? null;
  /* «nechta f2 bor» — «bor» bu yerda «mavjud», «bor» (go) fe'li emas. */
  const miqdorSozi = bor(qolgan, stem(['qancha', 'necha', 'nechta', 'jami', 'сколько']));
  const ochish = qolgan.some((t) => OCHISH_FELLARI.has(t) && !(t === sozNorm('bor') && miqdorSozi));

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

  /* 1a) Sahifa amallari (registry hook): hozirgi sahifaning o'z buyruqlari ochish/navigatsiyadan ustun. */
  const sa = sahifaAmalTop(kontent, ctx.sahifaAmallar);
  if (sa) return { tur: 'sahifaAmal', amal: sa };

  /* 1b) Hujjatlar: qarz, F2 ro'yxati, АОСР qamrovi (o'qish) va F2/АОСР QORALAMA (yozish — faqat taklif kartasi). */
  const f2Bor = bor(qolgan, F2_SOZ); const aosrBor = bor(qolgan, AOSR_SOZ);
  const qoralamaFel = qolgan.some((t) => QORALAMA_ANIQ.has(t));
  const savol = bor(qolgan, MIQDOR_SAVOL);
  /* «aosr yetishmayotganlarini ko'rsat» — «ko'rsat» fe'li o'qish niyatini bekor qilmaydi. */
  if (!ochish || (aosrBor && bor(qolgan, stem(['yetishmay', 'yetishmayotgan'])))) {
    if (bor(qolgan, OSUV_QIYIN)) return { tur: 'osuvchi', qism: 'qiyin' };
    if (bor(qolgan, OSUV_OGRAN) && bor(qolgan, OSUV_TIZIM)) return { tur: 'osuvchi', qism: 'oqigan' };
    if (bor(qolgan, QARZ) && savol) return { tur: 'qarz' };
    const obyektKerak = (davom: 'oqish' | 'yozuv'): Niyat | null => (amaldagi ? null : ctx.obyektlar.length ? { tur: 'obyektTanla', nomzodlar: ctx.obyektlar.slice(0, 6), davom } : null);
    if (aosrBor && qoralamaFel) { const k = obyektKerak('yozuv'); if (k) return k; if (amaldagi) return { tur: 'aosrQoralama', obyekt: amaldagi, filtr: aosrFiltr(kontent) }; }
    if (aosrBor && bor(qolgan, YETISHMAYDI)) { const k = obyektKerak('oqish'); if (k) return k; if (amaldagi) return { tur: 'aosrYetishmaydi', obyekt: amaldagi }; }
    if (f2Bor && qoralamaFel) { const k = obyektKerak('yozuv'); if (k) return k; if (amaldagi) return { tur: 'f2Qoralama', obyekt: amaldagi, oy: oyKalit ?? joriyOy(ctx.bugun) }; }
    if (f2Bor && savol && !bor(qolgan, SAVOL_SOZLARI)) { const k = obyektKerak('oqish'); if (k) return k; if (amaldagi) return { tur: 'f2Royxat', obyekt: amaldagi, oy: oyKalit }; }
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

/** АОСР qoralama filtri: АОСР/fe'l so'zlaridan tashqari qolgan so'zlar (bo'lim yoki ish nomi). */
function aosrFiltr(kontent: readonly string[]): string | null {
  const q = kontent.filter((t) => !bor([t], AOSR_SOZ) && !QORALAMA_ANIQ.has(t));
  return q.length ? q.join(' ').slice(0, 120) : null;
}

/** Sahifa amali: nomi (yoki kalitlari) so'zlarining hammasi so'rovda bo'lsa; eng ko'p so'z mos kelgani. */
function sahifaAmalTop(kontent: readonly string[], amallar: readonly SahifaAmalQisqa[] | undefined): SahifaAmalQisqa | null {
  if (!amallar?.length || !kontent.length) return null;
  let eng: { a: SahifaAmalQisqa; n: number } | null = null;
  for (const a of amallar) {
    for (const ibora of [a.nom, ...(a.kalitlar ?? [])]) {
      const w = sozlar(ibora).filter((x) => !TOLDIRUVCHI.has(x));
      if (!w.length || !w.every((x) => kontent.some((q) => sozMosligi(q, x) > 0))) continue;
      if (!eng || w.length > eng.n) eng = { a, n: w.length };
    }
  }
  return eng?.a ?? null;
}

const joriyOy = (b: Date = new Date()) => `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}`;
