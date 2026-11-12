/**
 * AMAL MOTORI (ekotizim V2, 3-qadam) — SOF (React/API yo'q): matn -> amal -> parametrlar (matn -> kontekst -> BITTA savol) -> oldindan ko'rish
 * -> tasdiq darajasi -> ijro (ijrochi tashqaridan beriladi) -> natija + havola. Jarvis (AiChat), mindmap kartasi va tugmalar shu motorni ishlatadi.
 * Qoidalar: pul va hajm HECH QACHON taxmin qilinmaydi (matnda aniq bitta son bo'lmasa — so'raladi); ruxsat yo'q amal yashirilmaydi,
 * sababi tushuntiriladi; pul/qaytarib bo'lmas amal bitta tasdiq bilan bajarilmaydi; qayta urinish (operation_id) ikkinchi marta yozmaydi.
 */
import { qidiruvTayyorla } from '../qidiruv-normalizatsiya';
import { sozlar, sozMosligi } from '../yordamchi/matn';
import { PERMISSION_LABELS } from '../company-authorization/permission-labels';
import { AMALLAR, type Amal, type AmalParam } from './amal';

export type AmalKontekst = {
  kompaniyaId: number | null;
  obyektId: number | null;
  obyektlar: readonly { id: number; nom: string }[];
  shartnomalar: readonly { id: number; raqam: string; nom?: string | null }[];
  joriyShartnomaId?: number | null;
  permissions: readonly string[] | null;
  superadmin: boolean;
  bugun: Date;
};

export type AmalNatija = { ok: boolean; xabar: string; havola?: string; takror?: boolean };
export type AmalKorinish = { matn: string; summa?: number | null };
export type Ijrochi = {
  korinish: (p: Record<string, unknown>, ctx: AmalKontekst) => AmalKorinish;
  ijro: (p: Record<string, unknown>, ctx: AmalKontekst, operationId: string) => Promise<AmalNatija>;
};
export type Tasdiqlar = { karta: boolean; ikkinchi: boolean };

export type AmalSessiya = { id: string; kalit: string; params: Record<string, unknown>; savol: { param: string; matn: string } | null };

export type AmalTopilma = { tur: 'aniq'; amal: Amal } | { tur: 'noaniq'; nomzodlar: Amal[] } | null;
export type AmalHolat =
  | { tur: 'ruxsatYoq'; matn: string }
  | { tur: 'savol'; param: string; matn: string }
  | { tur: 'tayyor' };

export class AmalTasdiqXato extends Error {
  kod: 'TASDIQ_KERAK' | 'IKKI_TASDIQ_KERAK' | 'RUXSAT_YOQ';
  constructor(kod: 'TASDIQ_KERAK' | 'IKKI_TASDIQ_KERAK' | 'RUXSAT_YOQ', msg: string) { super(msg); this.name = 'AmalTasdiqXato'; this.kod = kod; }
}

/* ── Niyat: matn -> amal ────────────────────────────────────────────────────────────────────────────────────────── */
const MOSLIK = 0.75;

function iboraBall(q: readonly string[], ibora: string): number {
  const w = sozlar(ibora);
  if (w.length < 2) return 0;   // bir so'zli sinonim sahifa/navigatsiya uchun — yozuv niyati emas
  let yig = 0;
  for (const aw of w) {
    let eb = 0;
    for (const qw of q) eb = Math.max(eb, sozMosligi(qw, aw));
    if (eb < MOSLIK) return 0;
    yig += eb;
  }
  return yig + 0.01 * w.length;
}

/** Yozuv amalini topadi. «sahifa» so'zi bo'lsa (navigatsiya) va ijro 'model' (qator topish kerak) bo'lsa — null (mavjud oqim hal qiladi). */
export function amalTopish(matn: string, royxat: readonly Amal[] = AMALLAR): AmalTopilma {
  const q = sozlar(matn);
  if (!q.length || q.some((s) => /^(сахиф|болим|экран|страниц|раздел)/.test(s))) return null;
  const ballar = royxat.filter((a) => a.turi === 'yozish' && a.ijro !== 'model').map((a) => {
    const iboralar = [a.nom, ...(a.sinonimlar ?? []), ...(a.en ?? [])].filter((x): x is string => !!x);
    return { a, ball: Math.max(0, ...iboralar.map((i) => iboraBall(q, i))) };
  }).filter((x) => x.ball > 0).sort((x, y) => y.ball - x.ball);
  if (!ballar.length) return null;
  const teng = ballar.filter((x) => Math.abs(x.ball - ballar[0].ball) < 0.005);
  return teng.length > 1 ? { tur: 'noaniq', nomzodlar: teng.slice(0, 4).map((x) => x.a) } : { tur: 'aniq', amal: ballar[0].a };
}

/* ── Ruxsat ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function ruxsatBormi(amal: Pick<Amal, 'capability'>, ctx: Pick<AmalKontekst, 'permissions' | 'superadmin'>): boolean {
  if (ctx.superadmin) return true;
  return !!ctx.permissions && ctx.permissions.includes(amal.capability);
}

export function ruxsatMatni(amal: Pick<Amal, 'capability' | 'nom'>): string {
  const nom = (PERMISSION_LABELS as Record<string, string>)[amal.capability] ?? amal.capability;
  return `«${amal.nom ?? amal.capability}» uchun sizda «${nom}» ruxsati yo‘q. Kompaniya administratoriga murojaat qiling — ruxsat berilgach shu buyruqni qaytaring.`;
}

/* ── Parametrlar ────────────────────────────────────────────────────────────────────────────────────────────────── */
const sana = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Matndan aniq BITTA son (pul/hajm). Bir nechta son yoki «КР-5» kabi kod ichidagi raqam — taxmin qilinmaydi (null). «5 mln», «500 ming» qo'llanadi. */
export function sonAjrat(matn: string): number | null {
  const toza = matn.replace(/[\p{L}]+-\d+/gu, ' ').replace(/№\s*\d+/g, ' ');
  const m = [...toza.matchAll(/(\d[\d\s]*(?:[.,]\d+)?)\s*(mlrd|mln|million|ming|тыс|млн)?/giu)].filter((x) => x[1].trim() !== '');
  if (m.length !== 1) return null;
  const v = Number(m[0][1].replace(/\s+/g, '').replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const k = (m[0][2] ?? '').toLowerCase();
  const ko = k === 'mlrd' ? 1e9 : (k === 'mln' || k === 'million' || k === 'млн') ? 1e6 : (k === 'ming' || k === 'тыс') ? 1e3 : 1;
  return v * ko;
}

function obyektTop(matn: string, ctx: AmalKontekst): { id: number; nom: string } | null {
  const nomzod = ctx.obyektlar.filter((o) => {
    const asos = o.nom.split(/[\s(,]+/).filter((s) => s.length >= 4).slice(0, 2);
    return asos.length > 0 && asos.some((s) => qidiruvTayyorla(s.slice(0, Math.max(4, s.length - 2)))(matn.toLowerCase()) || matn.toLowerCase().includes(s.toLowerCase().slice(0, Math.max(4, s.length - 2))));
  });
  return nomzod.length === 1 ? nomzod[0] : null;
}

function shartnomaTop(matn: string, ctx: AmalKontekst): { id: number } | null {
  const t = matn.toLowerCase();
  const r = [...t.matchAll(/(?:№|n|shartnoma|договор)\s*[-–]?\s*([a-z0-9а-я/._-]+)|([a-z0-9а-я/._-]*\d[a-z0-9а-я/._-]*)\s*[-–]?\s*(?:son)?\s*(?:shartnoma|договор)/giu)].map((m) => (m[1] ?? m[2] ?? '').toLowerCase()).filter(Boolean);
  const nomzod = ctx.shartnomalar.filter((s) => r.some((x) => s.raqam.toLowerCase() === x || s.raqam.toLowerCase().replace(/^0+/, '') === x.replace(/^0+/, '')));
  return nomzod.length === 1 ? nomzod[0] : null;
}

function matnAjrat(matn: string, ctx: AmalKontekst): string | null {
  const m = matn.match(/^(.+?)\s+(?:uchun|для)\b/iu);
  if (!m) return null;
  let s = m[1].trim();
  for (const o of ctx.obyektlar) s = s.replace(new RegExp(o.nom.split(/\s+/)[0], 'iu'), '').trim();
  s = s.replace(/^(?:iltimos|please)\s+/iu, '').trim();
  return s.length >= 2 ? s : null;
}

/** Berilgan matndan parametrlarni ajratadi (faqat ANIQ bo'lganlarini). */
export function parametrAjrat(amal: Amal, matn: string, ctx: AmalKontekst): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  /* Shartnoma raqami (12/2026) summa bilan adashmasin: son ajratishdan oldin matndan olib tashlanadi. */
  const shRaqam = (amal.parametrlar ?? []).some((p) => p.tur === 'shartnoma') ? ctx.shartnomalar.find((x) => x.id === shartnomaTop(matn, ctx)?.id)?.raqam : undefined;
  const sonMatni = shRaqam ? matn.split(shRaqam).join(' ') : matn;
  for (const p of amal.parametrlar ?? []) {
    if (p.tur === 'obyekt') { const o = obyektTop(matn, ctx); if (o) out[p.nom] = o.id; }
    else if (p.tur === 'shartnoma') { const s = shartnomaTop(matn, ctx); if (s) out[p.nom] = s.id; }
    else if (p.tur === 'son') { const n = sonAjrat(sonMatni); if (n != null && n > 0) out[p.nom] = n; }
    else if (p.tur === 'matn') { const t = matnAjrat(matn, ctx); if (t) out[p.nom] = t; }
    else if (p.tur === 'sana') { if (/\bbugun\b|сегодня/iu.test(matn)) out[p.nom] = sana(ctx.bugun); }
  }
  return out;
}

function kontekstdan(p: AmalParam, ctx: AmalKontekst): unknown {
  if (p.kontekst === 'obyekt') return ctx.obyektId ?? undefined;
  if (p.kontekst === 'shartnoma') return ctx.joriyShartnomaId ?? undefined;
  if (p.kontekst === 'bugun') return sana(ctx.bugun);
  return undefined;
}

/** Sessiyani boshlaydi: matndan ajratilgan parametrlar + operation_id (qayta urinish idempotent). */
export function sessiyaBosh(amal: Amal, matn: string, ctx: AmalKontekst, id: string = yangiId()): AmalSessiya {
  return { id, kalit: amal.kalit, params: parametrAjrat(amal, matn, ctx), savol: null };
}

/** Holat: ruxsat -> keyingi yetishmayotgan parametr (BITTA savol) -> tayyor. Kontekst parametrlari sessiyaga yoziladi. */
export function holat(amal: Amal, s: AmalSessiya, ctx: AmalKontekst): AmalHolat {
  if (!ruxsatBormi(amal, ctx)) return { tur: 'ruxsatYoq', matn: ruxsatMatni(amal) };
  for (const p of amal.parametrlar ?? []) {
    if (s.params[p.nom] != null && s.params[p.nom] !== '') continue;
    const k = kontekstdan(p, ctx);
    if (k != null) { s.params[p.nom] = k; continue; }
    if (!p.majburiy) continue;
    s.savol = { param: p.nom, matn: p.savol };
    return { tur: 'savol', param: p.nom, matn: p.savol };
  }
  s.savol = null;
  return { tur: 'tayyor' };
}

/** Savolga javobni qabul qiladi. Noto'g'ri (masalan son emas) bo'lsa — xabar bilan qayta so'raladi, taxmin qilinmaydi. */
export function javobQabul(amal: Amal, s: AmalSessiya, javob: string, ctx: AmalKontekst): { ok: true } | { ok: false; matn: string } {
  const p = (amal.parametrlar ?? []).find((x) => x.nom === s.savol?.param);
  if (!p) return { ok: false, matn: 'Hozir savol yo‘q.' };
  const t = javob.trim();
  if (p.tur === 'son') { const n = sonAjrat(t); if (n == null || n <= 0) return { ok: false, matn: `Raqam tushunarsiz. ${p.savol}` }; s.params[p.nom] = n; return { ok: true }; }
  if (p.tur === 'shartnoma') {
    const sh = shartnomaTop(`shartnoma ${t}`, ctx) ?? ctx.shartnomalar.find((x) => x.nom && x.nom.toLowerCase() === t.toLowerCase());
    if (!sh) return { ok: false, matn: `«${t}» shartnomasi topilmadi. ${p.savol}` };
    s.params[p.nom] = sh.id; return { ok: true };
  }
  if (p.tur === 'obyekt') {
    const o = ctx.obyektlar.filter((x) => x.nom.toLowerCase().includes(t.toLowerCase()));
    if (o.length !== 1) return { ok: false, matn: o.length ? `Bir nechta obyekt mos: ${o.slice(0, 4).map((x) => x.nom).join(', ')}. Aniqroq yozing.` : `«${t}» obyekti topilmadi. ${p.savol}` };
    s.params[p.nom] = o[0].id; return { ok: true };
  }
  if (p.tur === 'sana') {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : /^bugun$/iu.test(t) ? sana(ctx.bugun) : null;
    if (!d) return { ok: false, matn: `Sanani YYYY-OO-KK ko‘rinishida yozing. ${p.savol}` };
    s.params[p.nom] = d; return { ok: true };
  }
  if (t.length < 2) return { ok: false, matn: p.savol };
  s.params[p.nom] = t; return { ok: true };
}

/* ── Oldindan ko'rish va ijro ───────────────────────────────────────────────────────────────────────────────────── */
export function korinish(amal: Amal, s: AmalSessiya, ctx: AmalKontekst, ij?: Ijrochi): AmalKorinish {
  if (ij) return ij.korinish(s.params, ctx);
  return { matn: `${amal.nom ?? amal.kalit}: ${Object.entries(s.params).map(([k, v]) => `${k}=${String(v)}`).join(', ')}` };
}

const natijaKesh = new Map<string, AmalNatija>();
/** Testlar uchun. */
export function amalKeshTozala(): void { natijaKesh.clear(); }

export function tasdiqTalab(amal: Pick<Amal, 'tasdiq'>): 'yoq' | 'karta' | 'ikkiTasdiq' { return amal.tasdiq ?? 'karta'; }

/** Bajarish: ruxsat + tasdiq darajasi tekshiriladi; shu operation_id bilan qayta chaqirilsa avvalgi natija qaytadi (qayta yozilmaydi). */
export async function bajar(amal: Amal, s: AmalSessiya, t: Tasdiqlar, ctx: AmalKontekst, ij: Ijrochi): Promise<AmalNatija> {
  if (!ruxsatBormi(amal, ctx)) throw new AmalTasdiqXato('RUXSAT_YOQ', ruxsatMatni(amal));
  const daraja = tasdiqTalab(amal);
  if (daraja !== 'yoq' && !t.karta) throw new AmalTasdiqXato('TASDIQ_KERAK', 'Avval oldindan ko‘rishni tasdiqlang.');
  if (daraja === 'ikkiTasdiq' && !t.ikkinchi) throw new AmalTasdiqXato('IKKI_TASDIQ_KERAK', 'Pul yoki qaytarib bo‘lmaydigan amal: ikkinchi marta «Tasdiqlayman» bosing.');
  const eski = natijaKesh.get(s.id);
  if (eski) return { ...eski, takror: true };
  const n = await ij.ijro(s.params, ctx, s.id);
  if (n.ok) natijaKesh.set(s.id, n);
  return n;
}

export function yangiId(): string {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch { /* ishlatilmaydi */ }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Ctrl+K «Amallar» guruhi va «Bugun» uchun: foydalanuvchi bajara oladigan (ruxsati bor) amallar. */
export function amalRoyxati(ctx: Pick<AmalKontekst, 'permissions' | 'superadmin'>, royxat: readonly Amal[] = AMALLAR): Amal[] {
  return royxat.filter((a) => a.turi === 'yozish' && ruxsatBormi(a, ctx));
}