/**
 * Ombor lug'ati — YAGONA tushunish yadrosi (sof funksiyalar; DB/tarmoq yo'q): material va yetkazuvchi nomini kompaniyaning O'Z lug'atiga moslash.
 *
 * Tartib (arzon va tushuntirib beriladigan, AI siz): 1) kompaniya sinonimi (oldin tasdiqlangan ibora) → 2) kalit tengligi
 * (lotin/kirill, registr, M200=B15, m3=м3=куб, «sement/цемент») → 3) noaniq o'xshashlik. Natija: `avto` (aniq va yakka) | `tanlash` (3–5 variant) | `yangi`.
 * Variantlar KO'PAYMAYDI: bir xil kalitli yozilishlar bitta nomzodga yig'iladi. Yangi nom faqat foydalanuvchi tasdig'idan keyin lug'atga qo'shiladi.
 * Pul va narx bu yerda o'ylab topilmaydi: oxirgi narx faqat tarixdagi yozuvdan, yo'q bo'lsa null.
 */
import { birlikKaliti, nomTokenlari, tokenO_xshashlik, trigramO_xshashlik } from './moslash';

export type LugatTur = 'material' | 'kontragent';
export type Nomzod = { nomi: string; birligi: string | null; manba: 'lugat' | 'ombor' | 'katalog'; soni: number; oxirgi_sana: string | null; oxirgi_narx?: number | null };
export type LugatSinonim = { id?: number; tur: LugatTur; ibora_kalit: string; kanonik: string; birlik: string | null };
export type Aylantirish = { koef: number; dan: string; ga: string };
export type Variant = Nomzod & { ball: number; yorliq: string; aylantirish?: Aylantirish };
export type LugatNatija = { holat: 'avto' | 'tanlash' | 'yangi'; tanlangan: Variant | null; variantlar: Variant[]; sinonimdan: boolean };

/* ───────────── normallashtirish ───────────── */
// Beton sinfi (B) → marka (M) — standart muvofiqlik (B15 = M200).
const B_M: Record<string, number> = { '3.5': 50, '5': 75, '7.5': 100, '10': 150, '12.5': 150, '15': 200, '20': 250, '22.5': 300, '25': 350, '30': 400, '35': 450, '40': 500, '45': 600 };
const BETON = /(?<![\p{L}\d])(?:beton|бетон|rastvor|раствор)/iu;
const MARKA = /(?<![\p{L}\d])[mм]\s*-?\s*(\d{3})(?!\d)/giu;
const SINF = /(?<![\p{L}\d])(?:b\s*-?\s*|в-?)(\d{1,2}(?:[.,]5)?)(?![\d])/giu;
const SON = /^[0-9]+(?:\.[0-9]+)?$/;
const QOSH: Record<string, string> = { gisht: 'kirpich', kirpichi: 'kirpich', bloklar: 'blok', taxta: 'doska', doskalar: 'doska', betoni: 'beton', betonli: 'beton' };
const SHUM = new Set(['mchj', 'o', 'ooo', 'ao', 'xk', 'ip', 'yatt', 'llc', 'ltd', 'zao', 'oao', 'gup']);

/** Marka/sinf belgilarini bitta shaklga (`mrk200`) keltiradi; takror belgi («M200 (B15)») bittaga qisqaradi. */
function oldindan(s: string): string {
  let t = String(s ?? '').normalize('NFKC');
  const beton = BETON.test(t);
  t = t.replace(MARKA, (_m, d: string) => ` mrk${d} `);
  if (beton) t = t.replace(SINF, (m, d: string) => { const k = B_M[String(d).replace(',', '.')]; return k ? ` mrk${k} ` : m; });
  const ko = new Set<string>();
  return t.replace(/mrk\d+/g, (m) => (ko.has(m) ? ' ' : (ko.add(m), m)));
}

function tokenlar(s: string, tur: LugatTur): string[] {
  // lotin q/h ≈ kirill қ/к, х (asosiy normallashtirishda farq qoladi): ikkalasi bir kalitga tushsin
  let t = nomTokenlari(oldindan(s)).map((x) => QOSH[x] ?? x).map((x) => (SON.test(x) ? x : x.replace(/q/g, 'k').replace(/(?<![csgk])h/g, 'x')));
  if (tur === 'kontragent') t = t.filter((x) => !SHUM.has(x));
  return t.filter((x, i) => i === 0 || x !== t[i - 1]);
}
/** Lug'at kaliti: bir xil narsaning turli yozilishlari bir xil kalitga tushadi. */
export const lugatKalit = (s: string, tur: LugatTur = 'material'): string => tokenlar(s, tur).join(' ');

const EXTRA_BIRLIK: Record<string, string> = { kubometr: 'm3', kubik: 'm3', kubmetr: 'm3', kvadratmetr: 'm2', kvmetr: 'm2', qopcha: 'meshok' };
/** Birlik oilasi: m3 = м3 = куб = kubometr; qop = мешок. */
export function birlikLugat(b: string): string {
  const x = String(b ?? '').normalize('NFKC').toLowerCase().replace(/[\s.]+/g, '');
  return EXTRA_BIRLIK[x] ?? birlikKaliti(b);
}

/** Ma'lum aylantirish (faqat aniq ma'lum bo'lsa; aks holda null — o'ylab topilmaydi). 1 qop sement = 50 kg; 1 tonna = 1000 kg. */
export function aylantirishKoef(tokenlar_: readonly string[], dan: string, ga: string): number | null {
  if (dan === ga) return 1;
  if (dan === 'tn' && ga === 'kg') return 1000;
  if (dan === 'kg' && ga === 'tn') return 0.001;
  if (tokenlar_.includes('cement')) {
    if (dan === 'meshok' && ga === 'kg') return 50;
    if (dan === 'meshok' && ga === 'tn') return 0.05;
    if (dan === 'kg' && ga === 'meshok') return 0.02;
    if (dan === 'tn' && ga === 'meshok') return 20;
  }
  return null;
}

/* ───────────── moslash ───────────── */
const sonKalit = (t: string) => String(Number(t));

/** Damerau–Levenshtein (qo'shni harf almashinuvi 1 xato) — «armatrua» ≈ «armatura». */
function damerau(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

function ballHisobla(qk: string, qt: string[], ck: string, ct: string[]): number {
  if (qk && qk === ck) return 1;
  const qr = qt.filter((x) => SON.test(x)).map(sonKalit), cr = ct.filter((x) => SON.test(x)).map(sonKalit);
  if (qr.some((n) => !cr.includes(n))) return 0; // aytilgan o'lcham/marka nomzodda yo'q — boshqa material
  const ortiqchaRaqam = cr.some((n) => !qr.includes(n));
  const qw = qt.filter((x) => !SON.test(x)), cw = ct.filter((x) => !SON.test(x));
  let b = 0.55 * tokenO_xshashlik(qt, ct) + 0.45 * trigramO_xshashlik(qk, ck);
  const aniq = (w: string) => cw.some((c) => c === w || (w.length >= 3 && c.startsWith(w)));
  const taxm = (w: string) => cw.some((c) => trigramO_xshashlik(w, c) >= 0.75 || (w.length >= 5 && c.length >= 5 && damerau(w, c) <= (w.length >= 8 ? 2 : 1)));
  const ichida = qw.length > 0 && qw.every((w) => aniq(w) || taxm(w));
  if (ichida) {
    const imlo = qw.some((w) => !aniq(w)); // imlo xatosi bilan moslik — hech qachon avtomatik tanlanmaydi (tugma bilan tasdiqlanadi)
    const t = Math.max(b, 0.9 - (ortiqchaRaqam ? 0.1 : 0) - 0.02 * Math.min(3, Math.max(0, cw.length - qw.length)));
    b = imlo ? Math.min(t, 0.86) : t;
  } else if (ortiqchaRaqam) b *= 0.85;
  return Math.min(0.99, Math.round(b * 1000) / 1000);
}

const kDM = (sana: string | null) => (sana && /^\d{4}-\d{2}-\d{2}/.test(sana) ? `${sana.slice(8, 10)}.${sana.slice(5, 7)}` : null);
export function yorliqYasa(v: Pick<Nomzod, 'nomi' | 'birligi' | 'oxirgi_sana' | 'manba'>): string {
  const q: string[] = [];
  if (v.birligi) q.push(v.birligi);
  const d = kDM(v.oxirgi_sana);
  if (d) q.push(`oxirgi kirim ${d}`); else if (v.manba === 'katalog') q.push('katalogdan'); else if (v.manba === 'lugat') q.push('lug\'atdan');
  return q.length ? `${v.nomi} — ${q.join(', ')}` : v.nomi;
}

/** Bir xil kalitli yozilishlarni bitta nomzodga yig'adi (variantlar ko'paymasin): ko'rinadigan nom — eng ko'p ishlatilgani. */
export function nomzodYigish(x: readonly Nomzod[], tur: LugatTur): Nomzod[] {
  const guruh = new Map<string, Nomzod[]>();
  for (const n of x) {
    const nom = String(n.nomi ?? '').replace(/\s+/g, ' ').trim();
    if (!nom) continue;
    const k = lugatKalit(nom, tur) + '|' + (tur === 'material' && n.birligi ? birlikLugat(n.birligi) : '');
    (guruh.get(k) ?? guruh.set(k, []).get(k)!).push({ ...n, nomi: nom });
  }
  const out: Nomzod[] = [];
  for (const g of guruh.values()) {
    const eng = [...g].sort((a, b) => b.soni - a.soni || String(b.oxirgi_sana ?? '').localeCompare(String(a.oxirgi_sana ?? '')))[0];
    const sana = g.map((n) => n.oxirgi_sana).filter((s): s is string => !!s).sort().pop() ?? null;
    const narxli = [...g].filter((n) => n.oxirgi_narx != null).sort((a, b) => String(b.oxirgi_sana ?? '').localeCompare(String(a.oxirgi_sana ?? '')))[0];
    const manba = g.some((n) => n.manba === 'ombor') ? 'ombor' : g.some((n) => n.manba === 'lugat') ? 'lugat' : 'katalog';
    out.push({ nomi: eng.nomi, birligi: eng.birligi ?? g.find((n) => n.birligi)?.birligi ?? null, manba, soni: g.reduce((s, n) => s + n.soni, 0), oxirgi_sana: sana, oxirgi_narx: narxli?.oxirgi_narx ?? null });
  }
  return out;
}

export function lugatMosla(sorov: { nomi: string; birlik?: string | null }, nomzodlar: readonly Nomzod[], sinonimlar: readonly LugatSinonim[], tur: LugatTur = 'material'): LugatNatija {
  const qk = lugatKalit(sorov.nomi, tur), qt = tokenlar(sorov.nomi, tur);
  const yig = nomzodYigish(nomzodlar, tur);
  const qb = tur === 'material' && sorov.birlik ? birlikLugat(sorov.birlik) : null;
  const vOl = (n: Nomzod, b: number): Variant => {
    let ball = b, ayl: Aylantirish | undefined;
    if (qb && n.birligi) {
      const cb = birlikLugat(n.birligi);
      if (cb !== qb) {
        const k = aylantirishKoef(tokenlar(n.nomi, tur), qb, cb);
        if (k != null) { ayl = { koef: k, dan: sorov.birlik!, ga: n.birligi }; ball *= 0.97; } else ball *= 0.6;
      }
    }
    return { ...n, ball: Math.round(ball * 1000) / 1000, yorliq: yorliqYasa(n), ...(ayl ? { aylantirish: ayl } : {}) };
  };
  // 1) kompaniyaning oldin tasdiqlangan sinonimi
  const sin = qk ? sinonimlar.find((s) => s.tur === tur && s.ibora_kalit === qk) : undefined;
  if (sin) {
    const kk = lugatKalit(sin.kanonik, tur);
    const bor = yig.find((n) => lugatKalit(n.nomi, tur) === kk && (!sin.birlik || !n.birligi || birlikLugat(n.birligi) === birlikLugat(sin.birlik)));
    const v = vOl(bor ?? { nomi: sin.kanonik, birligi: sin.birlik, manba: 'lugat', soni: 1, oxirgi_sana: null }, 1);
    return { holat: 'avto', tanlangan: v, variantlar: [v], sinonimdan: true };
  }
  // 2–3) kalit tengligi / noaniq o'xshashlik
  const vs = yig.map((n) => vOl(n, ballHisobla(qk, qt, lugatKalit(n.nomi, tur), tokenlar(n.nomi, tur)))).filter((v) => v.ball >= 0.45)
    .sort((a, b) => b.ball - a.ball || b.soni - a.soni || a.nomi.localeCompare(b.nomi));
  const top = vs.slice(0, 5);
  if (!top.length) return { holat: 'yangi', tanlangan: null, variantlar: [], sinonimdan: false };
  const [a, b] = top;
  if (a.ball >= 0.9 && (!b || a.ball - b.ball >= 0.1)) return { holat: 'avto', tanlangan: a, variantlar: top, sinonimdan: false };
  return { holat: 'tanlash', tanlangan: null, variantlar: top, sinonimdan: false };
}

/**
 * Ko'p so'zli yetkazuvchi nomini qayta ajratish. Deterministik tahlil «<X>dan» da faqat BITTA so'zni oladi («Hamkor Qurilishdan» → yetkazuvchi «Qurilish»,
 * material «… Hamkor»). Bu yerda: 1) lug'at — nomi oxiridagi 1–3 so'zni yetkazuvchiga qo'shsak, ma'lum kontragentga aniq (yoki yaqin) moslashsa — ko'chiriladi;
 * 2) lug'atda yo'q bo'lsa — aniq chegara (marka/raqam yoki kichik harfli so'z) bor bo'lgandagina bosh harfli oxirgi so'zlar. Qolgan hollarda o'zgarmaydi.
 */
export function kontragentAjrat(nomi: string, kontragent: string, kNomzod: readonly Nomzod[], sin: readonly LugatSinonim[]): { nomi: string; kontragent: string; sabab: 'lugat' | 'bosh_harf' | null } {
  const bosh = { nomi, kontragent, sabab: null as null };
  const sozlar = nomi.split(/\s+/).filter(Boolean);
  if (sozlar.length < 2 || !kontragent.trim()) return bosh;
  const ball = (s: string) => { const r = lugatMosla({ nomi: s }, kNomzod, sin, 'kontragent'); return r.holat === 'avto' ? r.tanlangan!.ball : r.holat === 'tanlash' ? r.variantlar[0].ball : 0; };
  let eng = { k: 0, b: ball(kontragent) };
  for (let k = 1; k <= Math.min(3, sozlar.length - 1); k++) { const b = ball(`${sozlar.slice(-k).join(' ')} ${kontragent}`); if (b >= 0.85 && b > eng.b + 0.05) eng = { k, b }; }
  const olish = (k: number, sabab: 'lugat' | 'bosh_harf') => ({ nomi: sozlar.slice(0, -k).join(' '), kontragent: `${sozlar.slice(-k).join(' ')} ${kontragent}`, sabab });
  if (eng.k) return olish(eng.k, 'lugat');
  if (/^\p{Lu}/u.test(kontragent)) {
    const katta = (w: string) => /^\p{Lu}/u.test(w) && !/\d/.test(w);
    let k = 0; while (k < sozlar.length - 1 && katta(sozlar[sozlar.length - 1 - k])) k++;
    if (k > 0 && sozlar.slice(0, sozlar.length - k).some((w) => /^\p{Ll}/u.test(w) || /\d/.test(w))) return olish(k, 'bosh_harf');
  }
  return bosh;
}

/* ───────────── savol (tugmalar) ───────────── */
/** `yangi` — material «Yangi» tugmasi; `kontragent_yangi` — kontragent «Yangi» tugmasi; `ibora` — aytilgan ibora (ma'lumot uchun, server unga ishonmaydi). */
export type LugatTanlov = { nomi?: string; birligi?: string; kontragent?: string; yangi?: true; kontragent_yangi?: true; ibora?: string };
export type LugatVariant = { yorliq: string; tanlov: LugatTanlov };
export type LugatSavol = { kod: 'material' | 'kontragent'; savol: string; variantlar: LugatVariant[]; yangi_element: false };

/** Noaniq holatda bosiladigan tugmalar: 3–5 mavjud variant + «yangi» (faqat shu tugma bosilsa yangi element yaratiladi). */
export function lugatSavol(tur: LugatTur, ibora: string, v: LugatNatija, ru = false): LugatSavol {
  const mat = tur === 'material';
  const variantlar: LugatVariant[] = v.variantlar.slice(0, 5).map((x) => ({ yorliq: x.yorliq, tanlov: mat ? { nomi: x.nomi, ...(x.birligi ? { birligi: x.birligi } : {}), ibora } : { kontragent: x.nomi, ibora } }));
  variantlar.push({ yorliq: ru ? `Новый: «${ibora}»` : `Yangi: «${ibora}»`, tanlov: mat ? { nomi: ibora, yangi: true, ibora } : { kontragent: ibora, kontragent_yangi: true, ibora } });
  const savol = ru ? `${mat ? 'Какой материал' : 'Какой контрагент'} имеется в виду для «${ibora}»?` : `«${ibora}» — ${mat ? 'qaysi material' : 'qaysi kontragent'}?`;
  return { kod: tur, savol, variantlar, yangi_element: false };
}

/** Tasdiqdan keyin o'rganiladigan yozuv: ibora normallashtirishda kanonikka tushmasa (aks holda lug'at to'lmasin). */
export function oyrenishYozuvi(tur: LugatTur, ibora: string | null | undefined, kanonik: string | null | undefined, birlik: string | null = null): { tur: LugatTur; ibora: string; ibora_kalit: string; kanonik: string; birlik: string | null } | null {
  const i = String(ibora ?? '').replace(/\s+/g, ' ').trim(), k = String(kanonik ?? '').replace(/\s+/g, ' ').trim();
  if (!i || !k || i.length > 200 || k.length > 500) return null;
  const ik = lugatKalit(i, tur);
  if (!ik || ik === lugatKalit(k, tur)) return null;
  return { tur, ibora: i, ibora_kalit: ik, kanonik: k, birlik: birlik ? String(birlik).slice(0, 40) : null };
}
