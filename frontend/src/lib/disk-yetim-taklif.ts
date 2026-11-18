/**
 * disk-yetim-taklif.ts - Diskdagi «Biriktirilmagan» papka: har fayl uchun «Qaysi obyekt/loyihaga?» taklifi.
 * SOF modul (server ham, brauzer ham, test ham ishlatadi). Tartib:
 *   1) metadata: registry qatoridagi loyiha/obyekt (ball 1) - eng ishonchli;
 *   2) deterministik moslash: fayl nomi / asl nom / hujjat turi matni obyekt, loyiha va shartnoma nomlari bilan lotin<->kirill
 *      normallashtirilgan holda solishtiriladi (ball 0..1);
 *   3) noaniq qolganini AI hal qiladi (server: agent-hisob.aiHisobli orqali; bu yerda faqat AI javobini tekshirish `aiTaklifTekshir`).
 * Ruxsat/yo'l/kalit qoidasi SQL da (t2_disk_yetim_kochir_v1); bu modul faqat TAKLIF beradi, hech narsani ko'chirmaydi.
 */

export type YetimFayl = {
  id: number; nom: string; asl_nom?: string | null; hujjat_turi?: string | null; revision?: string | null; slot?: string | null;
  registry_loyiha_id?: number | null; registry_obyekt_id?: number | null;
};
export type YetimObyekt = { id: number; nom: string; loyiha_id: number; loyiha_nom?: string | null; shartnoma_id?: number | null; shartnoma_raqam?: string | null };
export type YetimLoyiha = { id: number; nom: string };
export type TaklifManba = 'metadata' | 'nom' | 'ai';
export type Taklif = {
  faylId: number;
  /** aniq - bir ma'noli; taxminiy - ishonchli, lekin foydalanuvchi ko'rib chiqsin; yoq - taklif yo'q. */
  daraja: 'aniq' | 'taxminiy' | 'yoq';
  manba: TaklifManba | null;
  loyihaId: number | null; obyektId: number | null;
  loyihaNom: string | null; obyektNom: string | null;
  ball: number;
};

const KIRILL: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'o', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'h', ц: 's', ч: 'c', ш: 's', щ: 's', ъ: '', ь: '', ы: 'i', э: 'e', ю: 'u', я: 'a', ў: 'u', қ: 'k', ғ: 'g', ҳ: 'h',
};
/** Qisqa, ovozli «skelet»: kirill/lotin, o'/g' apostroflari, x/h, q/k, w/v, ts/ch/sh farqlari yo'qoladi; ikki harf bitta bo'ladi. */
export function normalla(s: string | null | undefined): string {
  let r = String(s ?? '').toLowerCase().replace(/[ʻʼ’‘`´']/g, '');
  r = r.replace(/[а-яёўқғҳ]/g, (c) => KIRILL[c] ?? c);
  r = r.replace(/sh|ch|ts|yo|yu|ya|gh|kh/g, (m) => ({ sh: 's', ch: 'c', ts: 'c', yo: 'o', yu: 'u', ya: 'a', gh: 'g', kh: 'h' } as Record<string, string>)[m]);
  r = r.replace(/x/g, 'h').replace(/q/g, 'k').replace(/w/g, 'v').replace(/c/g, 's');
  return r.replace(/[^a-z0-9]+/g, ' ').replace(/(.)\1+/g, '$1').trim();
}

/** Tizim so'zlari: obyektni ajratmaydi (fayl nomida hamma joyda uchraydi). */
const TOSIQ = new Set(['obyekt', 'obekt', 'shartnoma', 'smeta', 'akt', 'hujjat', 'hujjatlari', 'lrv', 'res', 'forma', 'nashr', 'ombor', 'kirim', 'kirimi', 'oylik', 'paket', 'xlsx', 'pdf', 'docx', 'xls', 'nomi', 'fayl', 'faol', 'asl', 'loyiha', 'proekt', 'dogovor', 'kontrakt', 'sverka', 'qavat'].map(normalla));
const sozlar = (s: string): string[] => normalla(s).split(' ').filter((w) => w.length >= 3 && !TOSIQ.has(w) && !/^\d{4}$/.test(w));

function levMoslik(a: string, b: string): number {
  if (a === b) return 1;
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
}
/** Ikki so'zning o'xshashligi: teng 1; uzun prefiks 0.85; yaqin yozilish (>=5 harf) 0.7; aks holda 0. */
function sozMoslik(a: string, b: string): number {
  if (a === b) return 1;
  const kichik = a.length <= b.length ? a : b, katta = a.length <= b.length ? b : a;
  if (katta.startsWith(kichik) && (kichik.length >= 4 || (kichik.length === 3 && katta.length <= 4))) return 0.85;
  if (kichik.length >= 5) { const l = levMoslik(a, b); if (l >= 0.8) return 0.7; }
  return 0;
}
/** Nomzod so'zlari (nom) fayl matnida qanchasi uchraydi: 0..1 (uzun so'z og'irroq). */
function qamrov(nomSozlari: string[], matnSozlari: string[]): number {
  if (!nomSozlari.length) return 0;
  let jami = 0, topildi = 0;
  for (const s of nomSozlari) {
    const og = Math.min(s.length, 8); jami += og;
    let eng = 0; for (const t of matnSozlari) eng = Math.max(eng, sozMoslik(s, t));
    topildi += og * eng;
  }
  return topildi / jami;
}

type Nomzod = { loyihaId: number; obyektId: number | null; ball: number };
/** Fayl matni: nom + asl nom + slot. Hujjat turi/oy so'zlari (nakopitelniy, 2026-11) nomzodni ajratmaydi - TOSIQ va 4 raqamli yil chiqariladi. */
function faylMatni(f: YetimFayl): string[] {
  return [...new Set([f.nom, f.asl_nom, f.slot].flatMap((x) => sozlar(String(x ?? ''))))];
}

const ANIQ_BALL = 0.75, TAXMIN_BALL = 0.5, FARQ = 0.2;

/** Bitta fayl uchun deterministik taklif. */
export function faylTakliffi(f: YetimFayl, obyektlar: YetimObyekt[], loyihalar: YetimLoyiha[]): Taklif {
  const yoq: Taklif = { faylId: f.id, daraja: 'yoq', manba: null, loyihaId: null, obyektId: null, loyihaNom: null, obyektNom: null, ball: 0 };
  const loyNom = new Map(loyihalar.map((l) => [l.id, l.nom]));
  const obyNom = (o: YetimObyekt) => o.nom;

  // 1) metadata: registry qatori ko'rsatgan obyekt (loyihasi bor) yoki loyiha
  const ro = f.registry_obyekt_id != null ? obyektlar.find((o) => o.id === f.registry_obyekt_id) : undefined;
  if (ro) return { faylId: f.id, daraja: 'aniq', manba: 'metadata', loyihaId: ro.loyiha_id, obyektId: ro.id, loyihaNom: ro.loyiha_nom ?? loyNom.get(ro.loyiha_id) ?? null, obyektNom: obyNom(ro), ball: 1 };
  if (f.registry_loyiha_id != null && loyNom.has(f.registry_loyiha_id)) return { faylId: f.id, daraja: 'aniq', manba: 'metadata', loyihaId: f.registry_loyiha_id, obyektId: null, loyihaNom: loyNom.get(f.registry_loyiha_id) ?? null, obyektNom: null, ball: 1 };

  // 2) nom bo'yicha
  const matn = faylMatni(f);
  if (!matn.length) return yoq;
  const nomzodlar: Nomzod[] = [];
  const loyiholdi = new Map<number, number>();
  for (const l of loyihalar) loyiholdi.set(l.id, qamrov(sozlar(l.nom), matn));
  for (const o of obyektlar) {
    const oq = qamrov(sozlar(o.nom), matn);
    const lq = loyiholdi.get(o.loyiha_id) ?? qamrov(sozlar(o.loyiha_nom ?? ''), matn);
    const sh = o.shartnoma_raqam ? qamrov(sozlar(o.shartnoma_raqam).concat(normalla(o.shartnoma_raqam).split(' ').filter((w) => /\d/.test(w))), matn) : 0;
    if (oq > 0) nomzodlar.push({ loyihaId: o.loyiha_id, obyektId: o.id, ball: Math.min(1, oq + (lq >= 0.7 ? 0.1 : 0) + (sh >= 0.7 ? 0.05 : 0)) });
  }
  for (const l of loyihalar) { const q = loyiholdi.get(l.id) ?? 0; if (q > 0) nomzodlar.push({ loyihaId: l.id, obyektId: null, ball: q * 0.9 }); }
  if (!nomzodlar.length) return yoq;
  nomzodlar.sort((a, b) => b.ball - a.ball || (b.obyektId != null ? 1 : 0) - (a.obyektId != null ? 1 : 0));
  const [eng, ikkinchi] = nomzodlar;
  if (eng.ball < TAXMIN_BALL) return yoq;
  const birMa = !ikkinchi || ikkinchi.ball <= eng.ball - FARQ;
  const daraja = eng.ball >= ANIQ_BALL && birMa ? 'aniq' : 'taxminiy';
  const o = eng.obyektId != null ? obyektlar.find((x) => x.id === eng.obyektId) : undefined;
  return { faylId: f.id, daraja, manba: 'nom', loyihaId: eng.loyihaId, obyektId: eng.obyektId, loyihaNom: loyNom.get(eng.loyihaId) ?? o?.loyiha_nom ?? null, obyektNom: o ? obyNom(o) : null, ball: eng.ball };
}

export const takliflar = (fayllar: YetimFayl[], obyektlar: YetimObyekt[], loyihalar: YetimLoyiha[]): Taklif[] => fayllar.map((f) => faylTakliffi(f, obyektlar, loyihalar));

/** AI ga yuboriladigan nomzodlar: har fayl uchun qisman mos eng yaxshi 8 ta (yoki hammasi, agar 60 dan oshmasa). */
export function aiNomzodlari(fayllar: YetimFayl[], obyektlar: YetimObyekt[]): YetimObyekt[] {
  if (obyektlar.length <= 60) return obyektlar;
  const tanlangan = new Map<number, YetimObyekt>();
  for (const f of fayllar) {
    const matn = faylMatni(f);
    obyektlar.map((o) => ({ o, q: qamrov(sozlar(o.nom + ' ' + (o.loyiha_nom ?? '')), matn) })).sort((a, b) => b.q - a.q).slice(0, 8).forEach((x) => tanlangan.set(x.o.id, x.o));
  }
  return [...tanlangan.values()].slice(0, 120);
}

export const AI_TAKLIF_SXEMA = {
  name: 'disk_yetim_taklif',
  schema: { type: 'object', additionalProperties: false, required: ['natija'], properties: {
    natija: { type: 'array', maxItems: 40, items: { type: 'object', additionalProperties: false, required: ['fayl_id', 'obyekt_id', 'ishonch'], properties: {
      fayl_id: { type: 'integer' }, obyekt_id: { type: ['integer', 'null'] }, ishonch: { type: 'number' },
    } } },
  } },
};

/**
 * AI javobini QAT'IY tekshiradi: fayl ham, obyekt ham bizning ro'yxatdan bo'lishi shart (model id o'ylab topolmaydi), ishonch >= 0.6,
 * obyektsiz javob rad. Qaytadigan taklif darajasi har doim «taxminiy» - AI javobi foydalanuvchi tasdig'isiz «aniq» bo'lmaydi.
 */
export function aiTaklifTekshir(xom: unknown, fayllar: YetimFayl[], obyektlar: YetimObyekt[]): Taklif[] {
  const arr = xom && typeof xom === 'object' && Array.isArray((xom as { natija?: unknown }).natija) ? (xom as { natija: unknown[] }).natija : [];
  const fid = new Set(fayllar.map((f) => f.id));
  const oby = new Map(obyektlar.map((o) => [o.id, o]));
  const korildi = new Set<number>();
  const r: Taklif[] = [];
  for (const e of arr) {
    const x = e as { fayl_id?: unknown; obyekt_id?: unknown; ishonch?: unknown };
    const faylId = Number(x.fayl_id), obyektId = Number(x.obyekt_id), ishonch = Number(x.ishonch);
    if (!fid.has(faylId) || korildi.has(faylId) || !oby.has(obyektId) || !(ishonch >= 0.6)) continue;
    korildi.add(faylId);
    const o = oby.get(obyektId)!;
    r.push({ faylId, daraja: 'taxminiy', manba: 'ai', loyihaId: o.loyiha_id, obyektId: o.id, loyihaNom: o.loyiha_nom ?? null, obyektNom: o.nom, ball: Math.min(1, ishonch) });
  }
  return r;
}
